"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  KINDS,
  dayISO,
  emptySnapshot,
  habitCheckId,
  nextDue,
  type CountdownRecord,
  type HabitCheckRecord,
  type HabitRecord,
  type Kind,
  type ListRecord,
  type Snapshot,
  type TagRecord,
  type TaskRecord,
} from "@/lib/model";

type Records = Omit<Snapshot, "revision" | "reset">;

type PlannerContextValue = {
  ready: boolean;
  unlocked: boolean;
  syncing: boolean;
  error: string | null;
  unlock: (passphrase: string) => Promise<string | null>;
  lock: () => Promise<void>;
  data: Records;
  save: (kind: Kind, record: Records[Kind][number]) => void;
  completeTask: (task: TaskRecord) => void;
};

const PlannerContext = createContext<PlannerContextValue | null>(null);
const DB_NAME = "slate";
const DB_STORE = "state";

function emptyRecords(): Records {
  return { lists: [], tasks: [], tags: [], habits: [], habitChecks: [], countdowns: [] };
}

async function readCache(): Promise<{ revision: number; data: Records } | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 4000);
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    request.onsuccess = () => {
      window.clearTimeout(timer);
      const tx = request.result.transaction(DB_STORE, "readonly");
      const get = tx.objectStore(DB_STORE).get("snapshot");
      get.onsuccess = () => resolve((get.result as { revision: number; data: Records } | undefined) ?? null);
      get.onerror = () => resolve(null);
    };
  });
}

function writeCache(revision: number, data: Records) {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
  request.onsuccess = () => {
    const tx = request.result.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put({ revision, data }, "snapshot");
  };
}

function mergeRecord<T extends { id: string }>(list: T[], record: T): T[] {
  const index = list.findIndex((item) => item.id === record.id);
  if (index === -1) return [...list, record];
  const next = list.slice();
  next[index] = record;
  return next;
}

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Records>(emptyRecords);
  const revisionRef = useRef(0);
  const dataRef = useRef(data);
  const pending = useRef(new Map<string, { kind: Kind; record: Records[Kind][number] }>());
  const flushing = useRef(false);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const applySnapshot = useCallback((snapshot: Snapshot) => {
    setData((current) => {
      if (snapshot.reset) {
        const next = emptyRecords();
        for (const kind of KINDS) next[kind] = snapshot[kind] as never;
        dataRef.current = next;
        return next;
      }
      const next = { ...current };
      for (const kind of KINDS) {
        let list = current[kind] as { id: string }[];
        for (const record of snapshot[kind]) list = mergeRecord(list, record);
        next[kind] = list as never;
      }
      dataRef.current = next;
      return next;
    });
    revisionRef.current = snapshot.revision;
    setRevision(snapshot.revision);
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current || pending.current.size === 0) return;
    flushing.current = true;
    setSyncing(true);
    const batch = [...pending.current.values()];
    pending.current.clear();
    const records: Partial<Records> = {};
    for (const item of batch) {
      const list = (records[item.kind] ?? []) as Records[Kind];
      list.push(item.record as never);
      records[item.kind] = list as never;
    }
    try {
      const response = await fetch("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseRevision: revisionRef.current, records }),
      });
      if (response.status === 409) {
        const body = (await response.json()) as { snapshot: Snapshot };
        applySnapshot(body.snapshot);
        for (const item of batch) pending.current.set(`${item.kind}:${item.record.id}`, item);
        flushing.current = false;
        setSyncing(false);
        await flush();
        return;
      }
      if (!response.ok) throw new Error("Sync failed.");
      const snapshot = (await response.json()) as Snapshot;
      applySnapshot(snapshot);
      setError(null);
    } catch {
      for (const item of batch) pending.current.set(`${item.kind}:${item.record.id}`, item);
      setError("Changes are saved on this device and will sync when the connection returns.");
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, [applySnapshot]);

  const pull = useCallback(async () => {
    const manifestResponse = await fetch("/api/sync?manifest=1", {
      headers: { "If-None-Match": `"${revisionRef.current}"` },
    });
    if (manifestResponse.status === 304 || manifestResponse.status === 401) return;
    if (!manifestResponse.ok) return;
    const manifest = (await manifestResponse.json()) as { revision: number };
    if (manifest.revision === revisionRef.current) return;
    const snapshotResponse = await fetch(`/api/sync?after=${revisionRef.current}`);
    if (!snapshotResponse.ok) return;
    const snapshot = (await snapshotResponse.json()) as Snapshot;
    if (pending.current.size === 0) applySnapshot(snapshot);
  }, [applySnapshot]);

  useEffect(() => {
    let stop = false;
    void (async () => {
      const cached = await readCache();
      if (cached && !stop) {
        setData(cached.data);
        dataRef.current = cached.data;
        revisionRef.current = cached.revision;
        setRevision(cached.revision);
      }
      const session = await fetch("/api/sync?manifest=1");
      if (stop) return;
      if (session.ok || session.status === 304) {
        setUnlocked(true);
        await pull();
      }
      setReady(true);
    })();
    return () => {
      stop = true;
    };
  }, [pull]);

  useEffect(() => {
    if (!unlocked) return;
    writeCache(revision, data);
  }, [unlocked, revision, data]);

  useEffect(() => {
    if (!unlocked) return;
    const update = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", update);
    const timer = window.setInterval(update, 8000);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.clearInterval(timer);
    };
  }, [unlocked, pull]);

  const unlock = useCallback(async (passphrase: string) => {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return body?.error ?? "Could not unlock.";
    }
    setUnlocked(true);
    await pull();
    return null;
  }, [pull]);

  const lock = useCallback(async () => {
    await fetch("/api/session", { method: "DELETE" });
    setUnlocked(false);
  }, []);

  const save = useCallback(
    (kind: Kind, record: Records[Kind][number]) => {
      const stamped = { ...record, updatedAt: new Date().toISOString() };
      setData((current) => {
        const next = { ...current, [kind]: mergeRecord(current[kind] as { id: string }[], stamped) };
        dataRef.current = next;
        return next;
      });
      pending.current.set(`${kind}:${stamped.id}`, { kind, record: stamped });
      window.setTimeout(() => void flush(), 180);
    },
    [flush],
  );

  const completeTask = useCallback(
    (task: TaskRecord) => {
      if (task.repeat && task.dueOn && !task.completedAt) {
        save("tasks", { ...task, dueOn: nextDue(task.dueOn, task.repeat), completedAt: null });
        return;
      }
      save("tasks", { ...task, completedAt: task.completedAt ? null : new Date().toISOString() });
    },
    [save],
  );

  const value = useMemo<PlannerContextValue>(
    () => ({ ready, unlocked, syncing, error, unlock, lock, data, save, completeTask }),
    [ready, unlocked, syncing, error, unlock, lock, data, save, completeTask],
  );

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

export function usePlanner() {
  const value = useContext(PlannerContext);
  if (!value) throw new Error("Planner is missing.");
  return value;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function stampTask(partial: Partial<TaskRecord> & Pick<TaskRecord, "title">): TaskRecord {
  return {
    id: partial.id ?? newId(),
    title: partial.title,
    notes: partial.notes ?? "",
    listId: partial.listId ?? null,
    sectionId: partial.sectionId ?? null,
    priority: partial.priority ?? 0,
    tagIds: partial.tagIds ?? [],
    dueOn: partial.dueOn ?? null,
    dueTime: partial.dueTime ?? null,
    repeat: partial.repeat ?? null,
    remindMinutesBefore: partial.remindMinutesBefore ?? null,
    completedAt: partial.completedAt ?? null,
    subtasks: partial.subtasks ?? [],
    sort: partial.sort ?? Date.now(),
    updatedAt: new Date().toISOString(),
    deletedAt: partial.deletedAt ?? null,
  };
}

export function today(): string {
  return dayISO(new Date());
}

export function checkFor(checks: HabitCheckRecord[], habitId: string, day: string): HabitCheckRecord | undefined {
  return checks.find((check) => check.id === habitCheckId(habitId, day));
}

export type { HabitRecord, ListRecord, TagRecord, CountdownRecord, HabitCheckRecord };
