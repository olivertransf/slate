import { createHash } from "node:crypto";
import { emptySnapshot, habitCheckId, type Snapshot, type TaskRecord, type RepeatRule } from "./model.ts";

type TickTask = {
  id: string; projectId?: string; title?: string; content?: string; desc?: string;
  kind?: string; status?: number; completedTime?: string; sortOrder?: number;
  startDate?: string; dueDate?: string; isAllDay?: boolean; isFloating?: boolean;
  timeZone?: string; priority?: number; columnId?: string; parentId?: string;
  repeatFlag?: string; repeatFrom?: string; tags?: string[];
  reminders?: string[]; items?: { id: string; title?: string; status?: number; sortOrder?: number }[];
};
type TickProject = { id: string; name: string; color?: string; closed?: boolean; sortOrder?: number; groupId?: string; tasks?: TickTask[]; columns?: { id: string; name: string; sortOrder?: number }[] };
type TickHabit = { id: string; name: string; color?: string; goal?: number; unit?: string; repeatRule?: string; sortOrder?: number; status?: number; reminders?: string[] };
type TickCountdown = { id: string; name: string; date: number; color?: string; repeatFlag?: string; type?: number; dateDisplayFormat?: string; status?: number };
export type TickTickExport = {
  exportedAt: string; projects: TickProject[]; completed: TickTask[];
  tags: { name: string; label?: string; color?: string }[];
  groups: { id: string; name: string }[];
  habits: TickHabit[]; habitChecks: { habitId: string; checkins: { stamp: number; value?: number; status?: number }[] }[];
  countdowns: TickCountdown[];
};

const key = (kind: string, id: string) => `ticktick-${kind}-${id}`;
const tagKey = (name: string) => key("tag", createHash("sha256").update(name).digest("hex").slice(0, 24));
const normalize = (name: string) => name.normalize("NFKC").replace(/\s|\uFE0F/gu, "").toLowerCase();
const color = (value?: string) => value ? `#${value.replace(/^#/, "")}` : "#8c5efa";
const stampDay = (value: number) => String(value).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");

export function tickDate(value?: string, allDay = false, floating = false, timeZone = "America/Los_Angeles") {
  if (!value) return { day: null, time: null };
  if (allDay || floating) return { day: value.slice(0, 10), time: allDay ? null : value.slice(11, 16) };
  const date = new Date(value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (!Number.isFinite(date.valueOf())) throw new Error("TickTick returned an invalid date.");
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function tickRepeat(rule?: string): RepeatRule | null {
  if (!rule) return null;
  const fields: Record<string, string> = Object.fromEntries(rule.replace(/^RRULE:/, "").split(";").map((field) => field.split("=")));
  const units = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" } as const;
  if (!rule.startsWith("RRULE:") || !Object.hasOwn(units, fields.FREQ) || Object.keys(fields).some((field) => !["FREQ", "INTERVAL", "BYDAY", "UNTIL"].includes(field))) return null;
  const every = Number(fields.INTERVAL ?? 1);
  if (!Number.isInteger(every) || every < 1 || every > 99) return null;
  const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  if (fields.BYDAY && (fields.FREQ !== "WEEKLY" || fields.BYDAY.split(",").some((day) => !days.includes(day)))) return null;
  return { unit: units[fields.FREQ as keyof typeof units], every, ...(fields.BYDAY ? { weekdays: fields.BYDAY.split(",").map((day) => days.indexOf(day)) } : {}) };
}

export function importTickTick(source: TickTickExport, existing: Snapshot) {
  const records = emptySnapshot(existing.revision);
  const warnings: string[] = [];
  const updatedAt = source.exportedAt;
  let skipped = 0;
  const listIds = new Map<string, string | null>([["inbox", null]]);
  const sectionIds = new Map<string, string>();
  const sourceTasks = [...source.projects.flatMap((project) => project.tasks ?? []), ...source.completed];
  const inboxIds = new Set(source.projects.filter((project) => project.id === "inbox").flatMap((project) => (project.tasks ?? []).map((task) => task.projectId)).filter(Boolean));
  for (const id of inboxIds) listIds.set(id!, null);
  const projects = [...source.projects];
  for (const projectId of new Set(sourceTasks.map((task) => task.projectId).filter(Boolean))) {
    if (!listIds.has(projectId!) && !projects.some((project) => project.id === projectId)) {
      projects.push({ id: projectId!, name: `TickTick history · ${projectId!.slice(-6)}`, closed: true });
    }
  }
  for (const project of projects) {
    if (project.id === "inbox") continue;
    const stableId = key("list", project.id);
    const matches = existing.lists.filter((list) => !list.deletedAt && normalize(list.name) === normalize(project.name));
    const match = existing.lists.find((list) => list.id === stableId || list.sourceId === `ticktick:${project.id}`) ?? (matches.length === 1 ? matches[0] : undefined);
    const id = match?.id ?? stableId;
    listIds.set(project.id, id);
    const sections = (project.columns ?? []).map((column) => {
      const sectionId = match?.sections.find((section) => section.name === column.name)?.id ?? key("section", column.id);
      sectionIds.set(`${project.id}:${column.id}`, sectionId);
      return { id: sectionId, name: column.name, sort: column.sortOrder ?? 0 };
    });
    if (match && (match.id === stableId || match.sourceId === `ticktick:${project.id}`)) { skipped++; continue; }
    records.lists.push({
      ...match, id, sourceId: `ticktick:${project.id}`, name: match?.name ?? project.name, color: color(project.color), sort: project.sortOrder ?? 0,
      sections: [...(match?.sections ?? []), ...sections.filter((section) => !match?.sections.some((old) => old.id === section.id))],
      ...(project.groupId ? { area: source.groups.find((group) => group.id === project.groupId)?.name ?? "" } : {}),
      archivedAt: project.closed ? updatedAt : match?.archivedAt ?? null, updatedAt, deletedAt: match?.deletedAt ?? null,
    });
  }
  const tagIds = new Map<string, string>();
  const names = new Set([...source.tags.map((tag) => tag.name), ...sourceTasks.flatMap((task) => task.tags ?? [])]);
  for (const name of names) {
    const match = existing.tags.find((tag) => tag.id === tagKey(name) || (!tag.deletedAt && tag.name.toLowerCase() === name.toLowerCase()));
    const id = match?.id ?? tagKey(name);
    tagIds.set(name, id);
    if (!match) records.tags.push({ id, name: source.tags.find((tag) => tag.name === name)?.label ?? name, color: color(source.tags.find((tag) => tag.name === name)?.color), updatedAt, deletedAt: null });
  }
  const seen = new Set(existing.tasks.map((task) => task.id));
  for (const task of sourceTasks) {
    const id = key("task", task.id);
    if (seen.has(id)) { skipped++; continue; }
    seen.add(id);
    const due = tickDate(task.dueDate ?? task.startDate, task.isAllDay, task.isFloating, task.timeZone);
    const start = tickDate(task.startDate, task.isAllDay, task.isFloating, task.timeZone);
    const repeat = tickRepeat(task.repeatFlag);
    const extra: string[] = [];
    if (task.repeatFlag && !repeat) { extra.push(`TickTick recurrence: ${task.repeatFlag}`); warnings.push(`Unsupported recurrence on ${id}; preserved in notes.`); }
    if (task.parentId) extra.push(`Parent task: ticktick://task/${task.parentId}`);
    if ((task.reminders?.length ?? 0) > 1) extra.push(`TickTick reminders: ${task.reminders!.join(", ")}`);
    const reminder = task.reminders?.[0]?.match(/^TRIGGER(?:;RELATED=END)?:-(?:P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?)$/);
    const remindMinutesBefore = task.reminders?.[0] === "TRIGGER:PT0S" ? 0 : reminder ? Number(reminder[1] ?? 0) * 1440 + Number(reminder[2] ?? 0) * 60 + Number(reminder[3] ?? 0) : null;
    if (task.reminders?.length && remindMinutesBefore === null) { extra.push(`TickTick reminders: ${task.reminders.join(", ")}`); warnings.push(`Unsupported reminder on ${id}; preserved in notes.`); }
    const until = task.repeatFlag?.match(/UNTIL=(\d{8})/);
    records.tasks.push({
      id, title: task.title?.trim() || "Untitled", kind: task.kind === "NOTE" ? "note" : "task",
      notes: [task.content, task.desc && task.desc !== task.content ? task.desc : "", ...extra].filter(Boolean).join("\n\n"),
      listId: listIds.get(task.projectId ?? "inbox") ?? null, sectionId: sectionIds.get(`${task.projectId}:${task.columnId}`) ?? null,
      priority: (task.priority === 5 ? 3 : task.priority === 3 ? 2 : task.priority === 1 ? 1 : 0) as TaskRecord["priority"],
      tagIds: (task.tags ?? []).map((name) => tagIds.get(name)!), dueOn: due.day, dueTime: due.time,
      startOn: start.day, startTime: start.time, repeat, repeatAfterCompletion: task.repeatFrom === "1", repeatUntil: until ? stampDay(Number(until[1])) : null,
      remindMinutesBefore, completedAt: task.status === 2 ? new Date(task.completedTime ?? updatedAt).toISOString() : null,
      subtasks: [...(task.items ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((item) => ({ id: key("item", item.id), title: item.title ?? "", done: item.status === 1 })),
      sort: task.sortOrder ?? 0, updatedAt, deletedAt: task.status === -1 ? updatedAt : null,
    });
  }
  for (const habit of source.habits) {
    const id = key("habit", habit.id);
    if (existing.habits.some((item) => item.id === id)) { skipped++; continue; }
    const rule = tickRepeat(habit.repeatRule);
    if (!rule || !["day", "week"].includes(rule.unit) || rule.every !== 1) throw new Error(`Unsupported habit schedule for ${habit.name}; import stopped before saving.`);
    records.habits.push({ id, name: habit.name, color: color(habit.color), cadence: rule.unit === "week" ? "weekly" : "daily", weekdays: rule.weekdays, goal: habit.goal ?? 1, goalUnit: habit.unit ?? "Count", sort: habit.sortOrder ?? 0, archivedAt: habit.status === 1 ? updatedAt : null, reminderTime: habit.reminders?.[0]?.match(/\d{2}:\d{2}/)?.[0] ?? null, updatedAt, deletedAt: null });
  }
  const checkMap = new Map<string, Snapshot["habitChecks"][number]>();
  for (const document of source.habitChecks) {
    const habitId = key("habit", document.habitId);
    for (const check of document.checkins) {
      const day = stampDay(check.stamp), id = habitCheckId(habitId, day);
      if (existing.habitChecks.some((item) => item.id === id)) continue;
      checkMap.set(id, { id, habitId, day, count: check.status === 2 ? check.value ?? 1 : 0, updatedAt });
    }
  }
  records.habitChecks = [...checkMap.values()];
  for (const countdown of source.countdowns) {
    const id = key("countdown", countdown.id);
    if (existing.countdowns.some((item) => item.id === id)) { skipped++; continue; }
    records.countdowns.push({ id, title: countdown.name.trim(), day: stampDay(countdown.date), mode: countdown.type === 3 ? "countup" : "countdown", repeatYearly: countdown.repeatFlag?.includes("FREQ=YEARLY") ?? false, unit: ["week", "month", "year"].includes(countdown.dateDisplayFormat ?? "") ? countdown.dateDisplayFormat as "week" | "month" | "year" : "day", color: color(countdown.color), imageKey: null, sort: source.countdowns.indexOf(countdown), completed: countdown.status === 1, updatedAt, deletedAt: null });
  }
  return { records, skipped, warnings };
}
