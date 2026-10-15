import {
  KINDS,
  type CountdownRecord,
  type HabitCheckRecord,
  type HabitRecord,
  type Kind,
  type ListRecord,
  type RepeatRule,
  type Snapshot,
  type TagRecord,
  type TaskRecord,
} from "./model.ts";

const UNITS = new Set(["day", "week", "month", "year"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export type SanitizeResult = {
  records: Partial<Snapshot>;
  rejected: number;
};

function objectOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function idOf(value: unknown): string | null {
  return text(value, 80);
}

function stampOf(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10 || value.length > 40) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function nullableStamp(value: unknown): string | null | undefined {
  if (value == null) return null;
  return stampOf(value);
}

function nullableText(value: unknown, max: number): string | null | undefined {
  if (value == null) return null;
  return text(value, max);
}

function dayOf(value: unknown): string | null | undefined {
  if (value == null) return null;
  return typeof value === "string" && DAY.test(value) ? value : undefined;
}

function timeOf(value: unknown): string | null | undefined {
  if (value == null) return null;
  return typeof value === "string" && TIME.test(value) ? value : undefined;
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function repeatOf(value: unknown): RepeatRule | null | undefined {
  if (value == null) return null;
  const record = objectOf(value);
  if (!record || typeof record.unit !== "string" || !UNITS.has(record.unit)) return undefined;
  const every = numberOf(record.every);
  if (every == null || every < 1 || every > 99) return undefined;
  const weekdays = Array.isArray(record.weekdays)
    ? [...new Set(record.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))]
    : [];
  return {
    every: Math.floor(every),
    unit: record.unit as RepeatRule["unit"],
    ...(weekdays.length > 0 ? { weekdays } : {}),
  };
}

function listOf(value: unknown): ListRecord | null {
  const record = objectOf(value);
  if (!record) return null;
  const id = idOf(record.id);
  const name = text(record.name, 200);
  const color = text(record.color, 32);
  const sort = numberOf(record.sort);
  const updatedAt = stampOf(record.updatedAt);
  const deletedAt = nullableStamp(record.deletedAt);
  const archivedAt = nullableStamp(record.archivedAt);
  if (!id || !name || !color || sort == null || !updatedAt || deletedAt === undefined || archivedAt === undefined) return null;
  if (!Array.isArray(record.sections)) return null;
  const sections = [];
  for (const section of record.sections) {
    const item = objectOf(section);
    if (!item) return null;
    const sectionId = idOf(item.id);
    const sectionName = text(item.name, 200);
    const sectionSort = numberOf(item.sort);
    if (!sectionId || !sectionName || sectionSort == null) return null;
    sections.push({ id: sectionId, name: sectionName, sort: sectionSort });
  }
  return { id, name, color, sort, sections, archivedAt, updatedAt, deletedAt };
}

function taskOf(value: unknown): TaskRecord | null {
  const record = objectOf(value);
  if (!record) return null;
  const id = idOf(record.id);
  const title = text(record.title, 500);
  const notes = typeof record.notes === "string" && record.notes.length <= 20000 ? record.notes : null;
  const priority = numberOf(record.priority);
  const sort = numberOf(record.sort);
  const updatedAt = stampOf(record.updatedAt);
  const deletedAt = nullableStamp(record.deletedAt);
  const completedAt = nullableStamp(record.completedAt);
  const listId = nullableText(record.listId, 80);
  const sectionId = nullableText(record.sectionId, 80);
  const dueOn = dayOf(record.dueOn);
  const startOn = dayOf(record.startOn);
  const dueTime = timeOf(record.dueTime);
  const repeat = repeatOf(record.repeat);
  const remind = record.remindMinutesBefore == null ? null : numberOf(record.remindMinutesBefore);
  if (
    !id || title == null || notes == null || priority == null || priority < 0 || priority > 3 || sort == null ||
    !updatedAt || deletedAt === undefined || completedAt === undefined || listId === undefined || sectionId === undefined ||
    dueOn === undefined || startOn === undefined || dueTime === undefined || repeat === undefined || remind == null && record.remindMinutesBefore != null
  ) return null;
  if (!Array.isArray(record.tagIds) || !record.tagIds.every((tag) => typeof tag === "string")) return null;
  if (!Array.isArray(record.subtasks)) return null;
  const subtasks = [];
  for (const subtask of record.subtasks) {
    const item = objectOf(subtask);
    if (!item) return null;
    const subtaskId = idOf(item.id);
    const subtaskTitle = typeof item.title === "string" && item.title.length <= 500 ? item.title : null;
    if (!subtaskId || subtaskTitle == null || typeof item.done !== "boolean") return null;
    subtasks.push({ id: subtaskId, title: subtaskTitle, done: item.done });
  }
  return {
    id,
    title,
    notes,
    listId,
    sectionId,
    priority: priority as TaskRecord["priority"],
    tagIds: record.tagIds,
    dueOn,
    dueTime,
    startOn,
    repeat,
    remindMinutesBefore: remind == null ? null : Math.max(0, Math.min(10080, Math.floor(remind))),
    completedAt,
    subtasks,
    sort,
    updatedAt,
    deletedAt,
  };
}

function tagOf(value: unknown): TagRecord | null {
  const record = objectOf(value);
  if (!record) return null;
  const id = idOf(record.id);
  const name = text(record.name, 80);
  const color = text(record.color, 32);
  const updatedAt = stampOf(record.updatedAt);
  const deletedAt = nullableStamp(record.deletedAt);
  if (!id || !name || !color || !updatedAt || deletedAt === undefined) return null;
  return { id, name, color, updatedAt, deletedAt };
}

function habitOf(value: unknown): HabitRecord | null {
  const record = objectOf(value);
  if (!record) return null;
  const id = idOf(record.id);
  const name = text(record.name, 200);
  const color = text(record.color, 32);
  const sort = numberOf(record.sort);
  const goal = numberOf(record.goal);
  const updatedAt = stampOf(record.updatedAt);
  const deletedAt = nullableStamp(record.deletedAt);
  const archivedAt = nullableStamp(record.archivedAt);
  const reminderTime = timeOf(record.reminderTime);
  if (
    !id || !name || !color || sort == null || goal == null || goal < 1 || goal > 100 || !updatedAt ||
    deletedAt === undefined || archivedAt === undefined || reminderTime === undefined ||
    (record.cadence !== "daily" && record.cadence !== "weekly")
  ) return null;
  return {
    id,
    name,
    color,
    cadence: record.cadence,
    goal: Math.floor(goal),
    sort,
    archivedAt,
    reminderTime,
    updatedAt,
    deletedAt,
  };
}

function checkOf(value: unknown): HabitCheckRecord | null {
  const record = objectOf(value);
  if (!record) return null;
  const id = idOf(record.id);
  const habitId = idOf(record.habitId);
  const day = dayOf(record.day);
  const count = numberOf(record.count);
  const updatedAt = stampOf(record.updatedAt);
  if (!id || !habitId || !day || count == null || count < 0 || count > 100 || !updatedAt) return null;
  return { id, habitId, day, count: Math.floor(count), updatedAt };
}

function countdownOf(value: unknown): CountdownRecord | null {
  const record = objectOf(value);
  if (!record) return null;
  const id = idOf(record.id);
  const title = text(record.title, 200);
  const day = dayOf(record.day);
  const color = text(record.color, 32);
  const sort = numberOf(record.sort);
  const updatedAt = stampOf(record.updatedAt);
  const deletedAt = nullableStamp(record.deletedAt);
  const imageKey = record.imageKey == null ? null : text(record.imageKey, 160);
  const remind = record.remindDaysBefore == null ? null : numberOf(record.remindDaysBefore);
  if (
    !id || !title || !day || !color || sort == null || !updatedAt || deletedAt === undefined || imageKey === undefined ||
    (record.mode !== "countdown" && record.mode !== "countup") ||
    typeof record.repeatYearly !== "boolean" ||
    (record.unit !== "day" && record.unit !== "week" && record.unit !== "month" && record.unit !== "year") ||
    (remind == null && record.remindDaysBefore != null)
  ) return null;
  return {
    id,
    title,
    day,
    mode: record.mode,
    repeatYearly: record.repeatYearly,
    unit: record.unit,
    color,
    imageKey,
    remindDaysBefore: remind == null ? null : Math.max(0, Math.min(365, Math.floor(remind))),
    sort,
    updatedAt,
    deletedAt,
  };
}

function one(kind: Kind, value: unknown): Snapshot[Kind][number] | null {
  switch (kind) {
    case "lists":
      return listOf(value);
    case "tasks":
      return taskOf(value);
    case "tags":
      return tagOf(value);
    case "habits":
      return habitOf(value);
    case "habitChecks":
      return checkOf(value);
    case "countdowns":
      return countdownOf(value);
    default: {
      const unreachable: never = kind;
      throw new Error(`Unknown kind ${unreachable}`);
    }
  }
}

export function sanitizeRecords(incoming: Partial<Record<Kind, unknown>>): SanitizeResult {
  const records: Partial<Snapshot> = {};
  let rejected = 0;
  for (const kind of KINDS) {
    const list = incoming[kind];
    if (!Array.isArray(list)) continue;
    const clean: Snapshot[Kind] = [];
    for (const item of list) {
      const record = one(kind, item);
      if (!record) {
        rejected += 1;
        continue;
      }
      clean.push(record as never);
    }
    records[kind] = clean as never;
  }
  return { records, rejected };
}
