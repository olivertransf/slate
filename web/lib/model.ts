export const LIST_COLORS = [
  "#4C6FFF",
  "#22A06B",
  "#E5484D",
  "#F5A524",
  "#8E4EC6",
  "#12A594",
  "#E54666",
  "#0091FF",
] as const;

export const SCHEMA_VERSION = 2;

export type RepeatRule = {
  every: number;
  unit: "day" | "week" | "month" | "year";
  weekdays?: number[];
};

export type Section = {
  id: string;
  name: string;
  sort: number;
};

export type ListRecord = {
  id: string;
  name: string;
  color: string;
  sort: number;
  sections: Section[];
  archivedAt?: string | null;
  updatedAt: string;
  deletedAt: string | null;
};

export type Subtask = {
  id: string;
  title: string;
  done: boolean;
};

export type TaskRecord = {
  id: string;
  title: string;
  notes: string;
  listId: string | null;
  sectionId: string | null;
  priority: 0 | 1 | 2 | 3;
  tagIds: string[];
  dueOn: string | null;
  dueTime: string | null;
  startOn?: string | null;
  repeat: RepeatRule | null;
  remindMinutesBefore: number | null;
  completedAt: string | null;
  subtasks: Subtask[];
  sort: number;
  updatedAt: string;
  deletedAt: string | null;
};

export type TagRecord = {
  id: string;
  name: string;
  color: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type HabitRecord = {
  id: string;
  name: string;
  color: string;
  cadence: "daily" | "weekly";
  goal: number;
  sort: number;
  archivedAt?: string | null;
  reminderTime?: string | null;
  updatedAt: string;
  deletedAt: string | null;
};

export type HabitCheckRecord = {
  id: string;
  habitId: string;
  day: string;
  count: number;
  updatedAt: string;
};

export type CountdownRecord = {
  id: string;
  title: string;
  day: string;
  mode: "countdown" | "countup";
  repeatYearly: boolean;
  unit: "day" | "week" | "month" | "year";
  color: string;
  imageKey: string | null;
  remindDaysBefore?: number | null;
  sort: number;
  updatedAt: string;
  deletedAt: string | null;
};

export type Kind = "lists" | "tasks" | "tags" | "habits" | "habitChecks" | "countdowns";

export const KINDS: Kind[] = ["lists", "tasks", "tags", "habits", "habitChecks", "countdowns"];

export type Snapshot = {
  schemaVersion?: number;
  revision: number;
  reset: boolean;
  lists: ListRecord[];
  tasks: TaskRecord[];
  tags: TagRecord[];
  habits: HabitRecord[];
  habitChecks: HabitCheckRecord[];
  countdowns: CountdownRecord[];
};

export type ManifestChange = {
  revision: number;
  kind: Kind;
  id: string;
};

export type Manifest = {
  schemaVersion?: number;
  revision: number;
  updatedAt: string;
  changes: ManifestChange[];
  mutations?: string[];
};

export function emptySnapshot(revision = 0): Snapshot {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision,
    reset: true,
    lists: [],
    tasks: [],
    tags: [],
    habits: [],
    habitChecks: [],
    countdowns: [],
  };
}

export function dayISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function addDays(value: string, days: number): string {
  const date = parseDay(value);
  date.setDate(date.getDate() + days);
  return dayISO(date);
}

export function startOfWeek(value: string): string {
  const date = parseDay(value);
  date.setDate(date.getDate() - date.getDay());
  return dayISO(date);
}

export function addMonths(value: string, months: number): string {
  const date = parseDay(value);
  date.setMonth(date.getMonth() + months);
  return dayISO(date);
}

export function daysBetween(from: string, to: string): number {
  const start = parseDay(from).getTime();
  const end = parseDay(to).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function nextDue(dueOn: string, rule: RepeatRule, from = dueOn): string {
  const every = Math.max(1, Math.floor(rule.every) || 1);
  const weekdays = [...new Set((rule.weekdays ?? []).filter((day) => day >= 0 && day <= 6))];
  if (rule.unit === "week" && weekdays.length > 0) {
    if (dueOn > from) return dueOn;
    const origin = startOfWeek(dueOn);
    let cursor = dueOn;
    let guard = 0;
    while (guard < 4000) {
      guard += 1;
      cursor = addDays(cursor, 1);
      if (!weekdays.includes(parseDay(cursor).getDay())) continue;
      const weeks = Math.floor(daysBetween(origin, startOfWeek(cursor)) / 7);
      if (weeks % every !== 0) continue;
      if (cursor > from) return cursor;
    }
    return cursor;
  }
  let cursor = dueOn;
  let guard = 0;
  while (cursor <= from && guard < 4000) {
    guard += 1;
    if (rule.unit === "day") cursor = addDays(cursor, every);
    else if (rule.unit === "week") cursor = addDays(cursor, every * 7);
    else if (rule.unit === "month") cursor = addMonths(cursor, every);
    else cursor = addMonths(cursor, every * 12);
  }
  return cursor;
}

export function formatDay(value: string, today = dayISO(new Date())): string {
  if (value === today) return "Today";
  if (value === addDays(today, 1)) return "Tomorrow";
  if (value === addDays(today, -1)) return "Yesterday";
  const date = parseDay(value);
  const weekStart = startOfWeek(today);
  if (value >= weekStart && value <= addDays(weekStart, 6)) {
    return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatTime(value: string | null): string {
  if (!value) return "";
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return minute === 0 ? `${hour12} ${suffix}` : `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function monthGrid(anchor: string): string[] {
  const date = parseDay(anchor);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - start.getDay());
  const days: string[] = [];
  for (let index = 0; index < 42; index += 1) {
    const cell = new Date(start);
    cell.setDate(start.getDate() + index);
    days.push(dayISO(cell));
  }
  return days;
}

export function alive<T extends { deletedAt: string | null }>(records: T[]): T[] {
  return records.filter((record) => record.deletedAt == null);
}

export function visibleLists(lists: ListRecord[]): ListRecord[] {
  return alive(lists).filter((list) => !list.archivedAt).sort((a, b) => a.sort - b.sort);
}

export type SortMode = "manual" | "date" | "priority" | "title";

export function sortTasks(tasks: TaskRecord[], mode: SortMode): TaskRecord[] {
  const copy = tasks.slice();
  if (mode === "date") copy.sort((a, b) => (a.dueOn ?? "9999-99-99").localeCompare(b.dueOn ?? "9999-99-99") || a.sort - b.sort);
  else if (mode === "priority") copy.sort((a, b) => b.priority - a.priority || a.sort - b.sort);
  else if (mode === "title") copy.sort((a, b) => a.title.localeCompare(b.title) || a.sort - b.sort);
  else copy.sort((a, b) => a.sort - b.sort);
  return copy;
}

export function searchTasks(tasks: TaskRecord[], query: string): TaskRecord[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return tasks;
  return tasks.filter((task) => `${task.title} ${task.notes}`.toLowerCase().includes(needle));
}

export function taskOpen(task: TaskRecord): boolean {
  return task.deletedAt == null && task.completedAt == null;
}

export function matchesView(task: TaskRecord, view: string, today = dayISO(new Date())): boolean {
  if (view === "trash") return task.deletedAt != null;
  if (view === "completed") return task.deletedAt == null && task.completedAt != null;
  if (!taskOpen(task)) return false;
  if (view === "inbox") return task.listId == null;
  if (view === "today") return task.dueOn != null && task.dueOn <= today;
  if (view === "tomorrow") return task.dueOn === addDays(today, 1);
  if (view === "week") return task.dueOn != null && task.dueOn <= addDays(today, 6);
  if (view === "overdue") return task.dueOn != null && task.dueOn < today;
  if (view.startsWith("list:")) return task.listId === view.slice(5);
  if (view.startsWith("tag:")) return task.tagIds.includes(view.slice(4));
  return false;
}

export function countdownAmount(record: CountdownRecord, today = dayISO(new Date())): number {
  let target = record.day;
  if (record.repeatYearly) {
    const currentYear = today.slice(0, 4);
    const annual = `${currentYear}-${record.day.slice(5)}`;
    target = annual >= today || record.mode === "countup" ? annual : `${Number(currentYear) + 1}-${record.day.slice(5)}`;
    if (record.mode === "countup" && annual > today) {
      target = `${Number(currentYear) - 1}-${record.day.slice(5)}`;
    }
  }
  const span = record.mode === "countup" ? daysBetween(target, today) : daysBetween(today, target);
  if (record.unit === "week") return Math.floor(span / 7);
  if (record.unit === "month") return Math.floor(span / 30);
  if (record.unit === "year") return Math.floor(span / 365);
  return span;
}

export function habitCheckId(habitId: string, day: string): string {
  return `${habitId}:${day}`;
}
