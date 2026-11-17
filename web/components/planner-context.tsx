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
import { mergeByUpdatedAt, mergeLists, stampValue } from "@/lib/merge";
import {
  KINDS,
  dayISO,
  habitCheckId,
  addDays,
  daysBetween,
  nextTaskDue,
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
  retrySync: () => void;
  data: Records;
  save: (kind: Kind, record: Records[Kind][number]) => void;
  saveBatch: (items: PendingItem[]) => void;
  completeTasks: (tasks: TaskRecord[]) => void;
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
    if (typeof indexedDB === "undefined") { resolve(null); return; }
    const request = indexedDB.open(DB_NAME, 1);
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; resolve(null); }, 4000);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
    };
    request.onerror = () => { window.clearTimeout(timer); resolve(null); };
    request.onsuccess = () => {
      window.clearTimeout(timer);
      if (timedOut) request.result.close();
      else resolve(request.result);
    };
  });
}

async function readCache(): Promise<CacheShape | null> {
  const db = await openDb().catch(() => null);
  if (!db) return null;
  try {
    return await new Promise<CacheShape | null>((resolve) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const request = tx.objectStore(DB_STORE).get("snapshot");
      request.onsuccess = () => resolve((request.result as CacheShape | undefined) ?? null);
      request.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

async function writeCache(snapshot: CacheShape) {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.oncomplete = tx.onabort = () => resolve();
      tx.objectStore(DB_STORE).put(snapshot, "snapshot");
    });
  } finally {
    db.close();
  }
}

let temporaryDevice: string | undefined;

function deviceId(): string {
  const key = "slate.device";
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(key, next);
    return next;
  } catch {
    return temporaryDevice ??= crypto.randomUUID();
  }
}

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Records>(emptyRecords);
  const [canUndo, setCanUndo] = useState(false);
  const revisionRef = useRef(0);
  const dataRef = useRef(data);
  const pending = useRef(new Map<string, PendingItem>());
  const flushing = useRef(false);
  const activeSession = useRef<symbol | null>(null);
  const pulling = useRef(false);
  const conflicts = useRef(0);
  const cacheWrites = useRef(Promise.resolve());
  const flushToken = useRef(crypto.randomUUID());
  const undoStack = useRef<UndoEntry[][]>([]);
  const skipUndo = useRef(false);

  const endSession = useCallback(() => {
    activeSession.current = null;
    undoStack.current = [];
    setCanUndo(false);
    setUnlocked(false);
  }, []);

  const rememberPending = useCallback(() => {
    const snapshot = {
      revision: revisionRef.current, data: dataRef.current,
      pending: [...pending.current.values()], flushToken: flushToken.current,
    };
    cacheWrites.current = cacheWrites.current.then(() => writeCache(snapshot)).catch(() => {});
  }, []);

  const applySnapshot = useCallback((snapshot: Snapshot, allowOlder = false) => {
    if (snapshot.revision < revisionRef.current && !(allowOlder && snapshot.reset)) return;
    const current = dataRef.current;
    const base = snapshot.reset ? emptyRecords() : { ...current };
    const next = { ...base };
    for (const kind of KINDS) {
      const remote = snapshot.reset ? snapshot[kind] : mergeLists(current[kind], snapshot[kind]);
      const queued = [...pending.current.values()].filter((item) => item.kind === kind).map((item) => item.record);
      next[kind] = mergeLists(remote, queued) as never;
    }
    dataRef.current = next;
    setData(next);
    revisionRef.current = snapshot.revision;
  }, []);

  const flush = useCallback(async () => {
    const session = activeSession.current;
    if (!session || pulling.current || flushing.current || pending.current.size === 0) return;
    flushing.current = true;
    setSyncing(true);
    const batch = [...pending.current.values()];
    const token = flushToken.current;
    const baseRevision = revisionRef.current;
    const records: Partial<Records> = {};
    for (const item of batch) {
      const list = (records[item.kind] ?? []) as Records[Kind];
      list.push(item.record as never);
      records[item.kind] = list as never;
    }
    let continueSync = false;
    try {
      const response = await fetch("/api/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseRevision, records, mutationId: token }),
        signal: AbortSignal.timeout(15_000),
      });
      if (activeSession.current !== session) return;
      if (response.status === 401) {
        endSession();
        return;
      }
      if (response.status === 409) {
        const body = (await response.json()) as { snapshot: Snapshot };
        if (activeSession.current !== session) return;
        setSyncState("conflict");
        applySnapshot(body.snapshot, revisionRef.current === baseRevision);
        rememberPending();
        conflicts.current += 1;
        continueSync = conflicts.current <= 3;
        if (!continueSync) {
          setSyncState("offline");
          setError("Slate couldn’t reconcile changes yet. Retry to sync.");
        }
        return;
      }
      if (!response.ok) throw new Error("Sync failed.");
      const snapshot = (await response.json()) as Snapshot;
      if (activeSession.current !== session) return;
      for (const item of batch) {
        const key = `${item.kind}:${item.record.id}`;
        if (pending.current.get(key) === item) pending.current.delete(key);
      }
      applySnapshot(snapshot, revisionRef.current === baseRevision);
      conflicts.current = 0;
      continueSync = true;
      if (flushToken.current === token) flushToken.current = crypto.randomUUID();
      setError(null);
      setSyncState(pending.current.size > 0 ? "syncing" : "idle");
      rememberPending();
    } catch {
      if (activeSession.current !== session) return;
      setSyncState("offline");
      conflicts.current = 0;
      setError("Changes haven’t synced yet. Slate will retry automatically.");
      rememberPending();
    } finally {
      if (flushing.current) {
        flushing.current = false;
        setSyncing(false);
      }
      if (continueSync && pending.current.size) window.setTimeout(() => void flush(), 180 * Math.max(1, conflicts.current));
    }
  }, [applySnapshot, endSession, rememberPending]);

  const pull = useCallback(async () => {
    const session = activeSession.current;
    if (!session || pulling.current || flushing.current) return;
    pulling.current = true;
    try {
      const baseRevision = revisionRef.current;
      const manifestResponse = await fetch("/api/sync?manifest=1", {
        headers: { "If-None-Match": `"${baseRevision}"` },
        signal: AbortSignal.timeout(15_000),
      });
      if (activeSession.current !== session) return;
      if (manifestResponse.status === 401) { endSession(); return; }
      if (manifestResponse.status !== 304) {
        if (!manifestResponse.ok) throw new Error("Could not read the sync revision.");
        const manifest = (await manifestResponse.json()) as { revision: number };
        if (manifest.revision !== baseRevision) {
          const response = await fetch(`/api/sync?after=${baseRevision}`, { signal: AbortSignal.timeout(15_000) });
          if (activeSession.current !== session) return;
          if (response.status === 401) { endSession(); return; }
          if (!response.ok) throw new Error("Could not download the planner.");
          const snapshot = (await response.json()) as Snapshot;
          if (activeSession.current !== session) return;
          applySnapshot(snapshot, true);
          rememberPending();
        }
      }
      if (pending.current.size === 0) {
        setSyncState("idle");
        setError(null);
      }
    } catch {
      if (activeSession.current !== session) return;
      setSyncState("offline");
      setError(pending.current.size ? "Changes haven’t synced yet. Slate will retry automatically." : "Slate couldn’t check for updates. It will retry automatically.");
    } finally {
      pulling.current = false;
      if (activeSession.current && pending.current.size) void flush();
    }
  }, [applySnapshot, endSession, flush, rememberPending]);

  useEffect(() => {
    let stop = false;
    void (async () => {
      const [cached, session] = await Promise.all([
        readCache().catch(() => null),
        fetch("/api/sync?manifest=1", { signal: AbortSignal.timeout(15_000) }).catch(() => null),
      ]);
      if (stop) return;
      if (cached) {
        setData(cached.data);
        dataRef.current = cached.data;
        revisionRef.current = cached.revision;
        for (const item of cached.pending ?? []) pending.current.set(`${item.kind}:${item.record.id}`, item);
        if (cached.flushToken) flushToken.current = cached.flushToken;
      }
      if (session?.ok) {
        activeSession.current = Symbol();
        setUnlocked(true);
        await pull();
      }
      if (!stop) setReady(true);
    })();
    return () => { stop = true; };
  }, [pull]);

  const retrySync = useCallback(() => {
    conflicts.current = 0;
    if (pending.current.size > 0) void flush();
    else void pull();
  }, [flush, pull]);

  useEffect(() => {
    if (!unlocked || !ready) return;
    const update = () => {
      if (document.visibilityState === "visible") retrySync();
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("online", update);
    const timer = window.setInterval(update, 8000);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("online", update);
      window.clearInterval(timer);
    };
  }, [unlocked, ready, retrySync]);

  const unlock = useCallback(async (passphrase: string) => {
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase, device: deviceId() }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        return body?.error ?? "Could not unlock. Try again.";
      }
      activeSession.current = Symbol();
      setError(null);
      setSyncState("idle");
      await pull();
      setUnlocked(Boolean(activeSession.current));
      return activeSession.current ? null : "Your session expired. Try again.";
    } catch {
      return "Slate couldn’t reach the server. Check your connection and try again.";
    }
  }, [pull]);

  const lock = useCallback(async () => {
    try {
      const response = await fetch("/api/session", { method: "DELETE", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("Lock failed");
      endSession();
    } catch {
      setError("Slate couldn’t lock the session. Check your connection and try again.");
    }
  }, [endSession]);

  const saveBatch = useCallback((items: PendingItem[]) => {
    if (!items.length) return;
    const next = { ...dataRef.current };
    const entries: UndoEntry[] = [];
    for (const kind of KINDS) {
      const updates = new Map(items.filter((item) => item.kind === kind).map(({ record }) => [record.id, record]));
      if (!updates.size) continue;
      const previous = new Map(next[kind].map((record) => [record.id, record]));
      const stamped = [...updates.values()].map((record) => {
        const before = previous.get(record.id) ?? null;
        entries.push({ kind, before, id: record.id });
        const priorStamp = stampValue(before?.updatedAt);
        const updatedAt = new Date(Math.max(Date.now(), priorStamp + 1)).toISOString();
        const updated = { ...record, updatedAt };
        pending.current.set(`${kind}:${record.id}`, { kind, record: updated });
        return updated;
      });
      Object.assign(next, { [kind]: mergeByUpdatedAt(next[kind], stamped) });
    }
    if (!skipUndo.current) {
      undoStack.current.push(entries);
      if (undoStack.current.length > 50) undoStack.current.shift();
      setCanUndo(true);
    }
    flushToken.current = crypto.randomUUID();
    dataRef.current = next;
    setData(next);
    setSyncState("syncing");
    rememberPending();
    window.setTimeout(() => void flush(), 180);
  }, [flush, rememberPending]);

  const save = useCallback((kind: Kind, record: Records[Kind][number]) => {
    saveBatch([{ kind, record }]);
  }, [saveBatch]);

  const undo = useCallback(() => {
    const entries = undoStack.current.pop();
    setCanUndo(undoStack.current.length > 0);
    if (!entries) return;
    const items: PendingItem[] = [];
    for (const { kind, before, id } of entries) {
      if (before) {
        const record = kind === "tasks" ? {
          startTime: null, durationMinutes: null, someday: false, repeatAfterCompletion: false, repeatUntil: null, repeatHistory: [],
          ...before,
        } : kind === "lists" ? { area: "", description: "", favorite: false, ...before }
          : kind === "habits" ? { weekdays: [], goalUnit: "", ...before }
          : kind === "countdowns" ? { projectId: null, pinned: false, showOnCalendar: true, completed: false, ...before }
          : before;
        items.push({ kind, record });
      }
      else {
        const current = dataRef.current[kind].find((item) => item.id === id);
        if (current && "deletedAt" in current) items.push({ kind, record: { ...current, deletedAt: new Date().toISOString() } });
      }
    }
    skipUndo.current = true;
    saveBatch(items);
    skipUndo.current = false;
  }, [saveBatch]);

  const completeTasks = useCallback((tasks: TaskRecord[]) => {
    const now = new Date();
    const current = new Map(dataRef.current.tasks.map((task) => [task.id, task]));
    saveBatch(tasks.flatMap((requested) => {
      const task = current.get(requested.id);
      if (!task || task.deletedAt || task.kind === "note") return [];
      const next = !task.completedAt ? nextTaskDue(task, dayISO(now)) : null;
      if (next && task.dueOn) {
        const startOn = task.startOn ? addDays(task.startOn, daysBetween(task.dueOn, next)) : task.startOn;
        const repeatHistory = [
          ...(task.repeatHistory ?? []).filter((entry) => entry.dueOn !== task.dueOn),
          { dueOn: task.dueOn, completedAt: now.toISOString() },
        ].slice(-365);
        return [{ kind: "tasks", record: { ...task, dueOn: next, startOn, repeatHistory } }];
      }
      return [{ kind: "tasks", record: { ...task, completedAt: task.completedAt ? null : now.toISOString() } }];
    }));
  }, [saveBatch]);

  const completeTask = useCallback((task: TaskRecord) => completeTasks([task]), [completeTasks]);

  const value = useMemo<PlannerContextValue>(
    () => ({ ready, unlocked, syncing, syncState, error, canUndo, unlock, lock, retrySync, data, save, saveBatch, completeTask, completeTasks, undo }),
    [ready, unlocked, syncing, syncState, error, canUndo, unlock, lock, retrySync, data, save, saveBatch, completeTask, completeTasks, undo],
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
    ...partial,
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
    someday: partial.someday ?? false,
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
