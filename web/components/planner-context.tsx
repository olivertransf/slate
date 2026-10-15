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
import { mergeByUpdatedAt, mergeLists } from "@/lib/merge";
import {
  KINDS,
  dayISO,
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

type SyncState = "idle" | "syncing" | "offline" | "conflict";

type PendingItem = { kind: Kind; record: Records[Kind][number] };

type UndoEntry = { kind: Kind; before: Records[Kind][number] | null; id: string };

type PlannerContextValue = {
  ready: boolean;
  unlocked: boolean;
  syncing: boolean;
  syncState: SyncState;
  error: string | null;
  canUndo: boolean;
  unlock: (passphrase: string) => Promise<string | null>;
  lock: () => Promise<void>;
  data: Records;
  save: (kind: Kind, record: Records[Kind][number]) => void;
  completeTask: (task: TaskRecord) => void;
  undo: () => void;
};

const PlannerContext = createContext<PlannerContextValue | null>(null);
const DB_NAME = "slate";
const DB_STORE = "state";

function emptyRecords(): Records {
  return { lists: [], tasks: [], tags: [], habits: [], habitChecks: [], countdowns: [] };
}

type CacheShape = { revision: number; data: Records; pending?: PendingItem[]; flushToken?: string };

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readCache(): Promise<CacheShape | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(null), 4000);
    const tx = db.transaction(DB_STORE, "readonly");
    const get = tx.objectStore(DB_STORE).get("snapshot");
    get.onsuccess = () => {
      window.clearTimeout(timer);
      resolve((get.result as CacheShape | undefined) ?? null);
    };
    get.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
  });
}

function writeCache(revision: number, data: Records, pending: PendingItem[], flushToken: string) {
  void openDb().then((db) => {
    if (!db) return;
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put({ revision, data, pending, flushToken }, "snapshot");
  });
}

function deviceId(): string {
  const key = "slate.device";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(key, next);
  return next;
}

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Records>(emptyRecords);
  const [canUndo, setCanUndo] = useState(false);
  const revisionRef = useRef(0);
  const dataRef = useRef(data);
  const pending = useRef(new Map<string, PendingItem>());
  const flushing = useRef(false);
  const flushToken = useRef(crypto.randomUUID());
  const undoStack = useRef<UndoEntry[]>([]);
  const skipUndo = useRef(false);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const rememberPending = useCallback(() => {
    writeCache(revisionRef.current, dataRef.current, [...pending.current.values()], flushToken.current);
  }, []);

  const applySnapshot = useCallback((snapshot: Snapshot) => {
    setData((current) => {
      const base = snapshot.reset ? emptyRecords() : { ...current };
      const next = { ...base };
      for (const kind of KINDS) {
        const remote = snapshot.reset ? snapshot[kind] : mergeLists(current[kind], snapshot[kind]);
        const queued = [...pending.current.values()].filter((item) => item.kind === kind).map((item) => item.record);
        next[kind] = mergeLists(remote, queued) as never;
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
    const token = flushToken.current;
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
        body: JSON.stringify({ baseRevision: revisionRef.current, records, mutationId: token }),
      });
      if (response.status === 409) {
        for (const item of batch) pending.current.set(`${item.kind}:${item.record.id}`, item);
        const body = (await response.json()) as { snapshot: Snapshot };
        setSyncState("conflict");
        applySnapshot(body.snapshot);
        flushing.current = false;
        setSyncing(false);
        await flush();
        return;
      }
      if (!response.ok) throw new Error("Sync failed.");
      const snapshot = (await response.json()) as Snapshot;
      applySnapshot(snapshot);
      if (flushToken.current === token) flushToken.current = crypto.randomUUID();
      setError(null);
      setSyncState(pending.current.size > 0 ? "syncing" : "idle");
      rememberPending();
    } catch {
      for (const item of batch) pending.current.set(`${item.kind}:${item.record.id}`, item);
      setSyncState("offline");
      setError("Changes are saved on this device and will sync when the connection returns.");
      rememberPending();
    } finally {
      if (flushing.current) {
        flushing.current = false;
        setSyncing(false);
      }
    }
  }, [applySnapshot, rememberPending]);

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
    applySnapshot(snapshot);
    if (pending.current.size > 0) void flush();
  }, [applySnapshot, flush]);

  useEffect(() => {
    let stop = false;
    void (async () => {
      const cached = await readCache();
      if (cached && !stop) {
        setData(cached.data);
        dataRef.current = cached.data;
        revisionRef.current = cached.revision;
        setRevision(cached.revision);
        for (const item of cached.pending ?? []) pending.current.set(`${item.kind}:${item.record.id}`, item);
        if (cached.flushToken) flushToken.current = cached.flushToken;
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
    writeCache(revision, data, [...pending.current.values()], flushToken.current);
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
      body: JSON.stringify({ passphrase, device: deviceId() }),
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
      const previous = (dataRef.current[kind] as { id: string }[]).find((item) => item.id === stamped.id) ?? null;
      if (!skipUndo.current) {
        undoStack.current.push({ kind, before: previous as Records[Kind][number] | null, id: stamped.id });
        if (undoStack.current.length > 50) undoStack.current.shift();
        setCanUndo(true);
      }
      setData((current) => {
        const next = { ...current, [kind]: mergeByUpdatedAt(current[kind], [stamped]) };
        dataRef.current = next;
        return next;
      });
      pending.current.set(`${kind}:${stamped.id}`, { kind, record: stamped });
      setSyncState("syncing");
      rememberPending();
      window.setTimeout(() => void flush(), 180);
    },
    [flush, rememberPending],
  );

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    setCanUndo(undoStack.current.length > 0);
    if (!entry) return;
    skipUndo.current = true;
    if (entry.before) save(entry.kind, entry.before);
    else {
      const current = (dataRef.current[entry.kind] as { id: string; deletedAt?: string | null }[]).find((item) => item.id === entry.id);
      if (current && "deletedAt" in current) save(entry.kind, { ...current, deletedAt: new Date().toISOString() } as Records[Kind][number]);
    }
    skipUndo.current = false;
  }, [save]);

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
    () => ({ ready, unlocked, syncing, syncState, error, canUndo, unlock, lock, data, save, completeTask, undo }),
    [ready, unlocked, syncing, syncState, error, canUndo, unlock, lock, data, save, completeTask, undo],
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
    startOn: partial.startOn ?? null,
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
