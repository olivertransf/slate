import { addDays, type TaskRecord } from "./model";

export type GEvent = {
  id: string;
  title: string;
  day: string;
  time: string | null;
  allDay: boolean;
  color: string;
  calendarId: string;
  calendar: string;
  link: string;
};

export const GOOGLE_CHANGED = "slate-google-changed";
const GOOGLE_FRESH_MS = 120_000;
const STORE_KEY = "slate-google-days-v2";
type GoogleDay = { at: number; events: GEvent[] };
let days: Record<string, GoogleDay> | null = null;
let saveTimer: number | null = null;

function load(): Record<string, GoogleDay> {
  if (days) return days;
  try {
    days = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, GoogleDay>;
  } catch {
    days = {};
  }
  return days;
}

function save(): void {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const all = load();
    const low = addDays(today(), -120);
    const high = addDays(today(), 400);
    for (const key of Object.keys(all)) if (key < low || key > high) delete all[key];
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(all));
    } catch {
      window.localStorage.removeItem(STORE_KEY);
    }
  }, 500);
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function range(start: string, end: string): string[] {
  const out: string[] = [];
  for (let cursor = start; cursor < end && out.length < 400; cursor = addDays(cursor, 1)) out.push(cursor);
  return out;
}

export function storedGoogle(start: string, end: string): { events: GEvent[]; fresh: boolean; complete: boolean } {
  const all = load();
  const now = Date.now();
  const list = range(start, end);
  return {
    events: list.flatMap((day) => all[day]?.events ?? []),
    fresh: list.every((day) => all[day] && now - all[day].at < GOOGLE_FRESH_MS),
    complete: list.every((day) => Boolean(all[day])),
  };
}

export function rememberGoogle(start: string, end: string, events: GEvent[]): void {
  const all = load();
  const at = Date.now();
  const grouped: Record<string, GEvent[]> = {};
  for (const event of events) (grouped[event.day] ??= []).push(event);
  for (const day of range(start, end)) all[day] = { at, events: grouped[day] ?? [] };
  save();
}

export function staleGoogle(): void {
  const all = load();
  for (const key of Object.keys(all)) all[key].at = 0;
  save();
}

export function forgetGoogle(): void {
  days = {};
  window.localStorage.removeItem(STORE_KEY);
}

export type ConvertResult = { ok: true; event: GEvent } | { ok: false; error: string; reconnect: boolean };

export async function taskToEvent(task: TaskRecord, fallbackDay: string): Promise<ConvertResult> {
  const response = await fetch("/api/google/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: task.title,
      notes: task.notes,
      day: task.dueOn ?? fallbackDay,
      time: task.dueTime,
      minutes: 60,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  }).catch(() => null);
  if (!response) return { ok: false, error: "Could not reach the server.", reconnect: false };
  const payload = (await response.json().catch(() => ({}))) as { event?: GEvent; error?: string; reconnect?: boolean };
  if (!response.ok || !payload.event) {
    return { ok: false, error: payload.error ?? "Could not create the event.", reconnect: Boolean(payload.reconnect) };
  }
  staleGoogle();
  window.dispatchEvent(new Event(GOOGLE_CHANGED));
  return { ok: true, event: payload.event };
}
