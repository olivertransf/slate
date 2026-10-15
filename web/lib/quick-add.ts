import { addDays, dayISO, formatDay, type RepeatRule, type TaskRecord } from "./model.ts";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const WEEKDAY_ALIAS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3, weds: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export type TokenKind = "date" | "time" | "priority" | "tag" | "repeat";

export type QuickToken = {
  start: number;
  end: number;
  kind: TokenKind;
  text: string;
};

export type QuickAddDraft = {
  title: string;
  dueOn: string | null;
  dueTime: string | null;
  priority: TaskRecord["priority"];
  tagNames: string[];
  repeat: RepeatRule | null;
  tokens: QuickToken[];
};

const DATE = String.raw`\b(?:next\s+(?:week|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)|in\s+\d+\s+days?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|tomorrow|tmrw|tmr|tmw|tom|today|tonight|tod|yesterday|yest|yday|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b`;

const RULES: { kind: TokenKind; pattern: RegExp }[] = [
  { kind: "tag", pattern: /#([\p{L}\p{N}_-]+)/gu },
  { kind: "priority", pattern: /\b(p[1-3]|!{1,3})\b/gi },
  { kind: "repeat", pattern: /\b(every\s+day|daily|every\s+week|weekly|every\s+month|monthly|every\s+year|yearly)\b/gi },
  { kind: "time", pattern: /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi },
  { kind: "date", pattern: new RegExp(DATE, "gi") },
];

export function parseQuickAdd(input: string, today = dayISO(new Date()), ignored: string[] = []): QuickAddDraft {
  const skip = new Set(ignored.map((item) => item.toLowerCase()));
  const tokens: QuickToken[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of input.matchAll(rule.pattern)) {
      const text = match[0];
      const start = match.index ?? 0;
      const end = start + text.length;
      if (skip.has(text.toLowerCase())) continue;
      if (tokens.some((token) => start < token.end && end > token.start)) continue;
      tokens.push({ start, end, kind: rule.kind, text });
    }
  }
  tokens.sort((a, b) => a.start - b.start || b.end - a.end);

  let dueOn: string | null = null;
  let dueTime: string | null = null;
  let priority: TaskRecord["priority"] = 0;
  let repeat: RepeatRule | null = null;
  const tagNames: string[] = [];

  for (const token of tokens) {
    const raw = token.text;
    const normalized = raw.toLowerCase().replace(/\s+/g, " ");
    if (token.kind === "tag") tagNames.push(raw.slice(1));
    else if (token.kind === "priority") priority = priorityFrom(normalized);
    else if (token.kind === "repeat") repeat = repeatFrom(normalized);
    else if (token.kind === "time") dueTime = timeFrom(normalized);
    else dueOn = dateFrom(normalized, today);
  }

  let title = "";
  let cursor = 0;
  for (const token of tokens) {
    title += input.slice(cursor, token.start);
    cursor = token.end;
  }
  title += input.slice(cursor);
  title = title.replace(/\s+/g, " ").trim();

  return { title, dueOn, dueTime, priority, tagNames, repeat, tokens };
}

export function tokenLabel(token: QuickToken, today = dayISO(new Date())): string {
  if (token.kind === "date") return formatDay(dateFrom(token.text.toLowerCase(), today) ?? today, today);
  if (token.kind === "time") return timeFrom(token.text.toLowerCase()) ?? token.text;
  if (token.kind === "priority") return `P${priorityFrom(token.text.toLowerCase())}`;
  if (token.kind === "repeat") return token.text.toLowerCase();
  return token.text;
}

function priorityFrom(token: string): TaskRecord["priority"] {
  if (token === "p1" || token === "!") return 1;
  if (token === "p2" || token === "!!") return 2;
  return 3;
}

function repeatFrom(token: string): RepeatRule {
  if (token.includes("day") || token === "daily") return { every: 1, unit: "day" };
  if (token.includes("week")) return { every: 1, unit: "week" };
  if (token.includes("month")) return { every: 1, unit: "month" };
  return { every: 1, unit: "year" };
}

function timeFrom(token: string): string | null {
  const match = token.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3] === "pm") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2] ?? "00"}`;
}

function dateFrom(token: string, today: string): string {
  const normalized = token.replace(/\s+/g, " ").trim();
  if (["today", "tod", "tonight"].includes(normalized)) return today;
  if (["tomorrow", "tmrw", "tmr", "tmw", "tom"].includes(normalized)) return addDays(today, 1);
  if (["yesterday", "yest", "yday"].includes(normalized)) return addDays(today, -1);
  if (normalized === "next week") return addDays(today, 7);
  if (normalized.startsWith("in ")) {
    const count = Number(normalized.match(/\d+/)?.[0] ?? 0);
    return addDays(today, count);
  }
  if (normalized.startsWith("next ")) {
    const name = normalized.slice(5);
    if (name === "week") return addDays(today, 7);
    return weekdayOnOrAfter(name, today, true);
  }
  const slash = normalized.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    let year = slash[3] ? Number(slash[3]) : Number(today.slice(0, 4));
    if (year < 100) year += 2000;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!slash[3] && iso < today) return `${year + 1}-${iso.slice(5)}`;
    return iso;
  }
  const monthMatch = normalized.match(/^([a-z]+)\s+(\d{1,2})/);
  if (monthMatch) {
    const month = MONTHS.findIndex((name) => monthMatch[1]?.startsWith(name));
    if (month >= 0) {
      const year = Number(today.slice(0, 4));
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(monthMatch[2]).padStart(2, "0")}`;
      return iso < today ? `${year + 1}-${iso.slice(5)}` : iso;
    }
  }
  return weekdayOnOrAfter(normalized, today, false);
}

function weekdayOnOrAfter(name: string, today: string, forceAhead: boolean): string {
  const wanted = WEEKDAY_ALIAS[name] ?? WEEKDAYS.indexOf(name as (typeof WEEKDAYS)[number]);
  const current = parseDayIndex(today);
  let delta = (wanted - current + 7) % 7;
  if (delta === 0 && forceAhead) delta = 7;
  if (delta === 0) delta = 7;
  return addDays(today, delta);
}

function parseDayIndex(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1).getDay();
}
