import { addDays } from "@/lib/model";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const SCOPE = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");
const REFRESH = "slate_gcal_refresh";
const STATE = "slate_gcal_state";

export type GoogleCalendar = {
  id: string;
  name: string;
  color: string;
  primary: boolean;
};

export type GoogleEvent = {
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

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
};

function clientId(): string {
  return (process.env.GOOGLE_CLIENT_ID ?? "").trim();
}

function clientSecret(): string {
  return (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
}

export function googleConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

export function redirectUri(request: Request): string {
  return `${new URL(request.url).origin}/api/google/callback`;
}

function cookie(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function stateCookie(state: string): string {
  return cookie(STATE, state, 10 * 60);
}

export function refreshCookie(token: string): string {
  return cookie(REFRESH, token, 60 * 60 * 24 * 400);
}

export function clearRefreshCookie(): string {
  return cookie(REFRESH, "", 0);
}

export function clearStateCookie(): string {
  return cookie(STATE, "", 0);
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function readState(request: Request): string | null {
  return readCookie(request, STATE);
}

export function readRefresh(request: Request): string | null {
  return readCookie(request, REFRESH);
}

export function authUrl(request: Request, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH}?${params.toString()}`;
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return (await response.json()) as TokenResponse;
}

export async function exchangeCode(request: Request, code: string): Promise<TokenResponse> {
  return postToken(new URLSearchParams({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(request),
    grant_type: "authorization_code",
  }));
}

async function accessToken(refresh: string): Promise<string | null> {
  const payload = await postToken(new URLSearchParams({
    refresh_token: refresh,
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "refresh_token",
  }));
  return payload.access_token ?? null;
}

async function googleGet<T>(token: string, path: string): Promise<T | null> {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

async function calendarsFor(token: string): Promise<GoogleCalendar[] | null> {
  const payload = await googleGet<{ items?: { id: string; summary?: string; backgroundColor?: string; primary?: boolean }[] }>(
    token,
    "/users/me/calendarList",
  );
  if (!payload?.items) return null;
  return payload.items.map((item) => ({
    id: item.id,
    name: item.summary || item.id,
    color: item.backgroundColor || "#4e81fb",
    primary: Boolean(item.primary),
  }));
}

export async function listCalendars(refresh: string): Promise<GoogleCalendar[] | null> {
  const token = await accessToken(refresh);
  if (!token) return null;
  return calendarsFor(token);
}

export function validZone(value: string | null | undefined): string | undefined {
  if (!value || value.length > 64) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}

function localParts(value: string, timeZone: string | undefined): { day: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

type RawEvent = {
  id?: string;
  summary?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

export async function listEvents(refresh: string, start: string, end: string, timeZone?: string): Promise<GoogleEvent[] | null> {
  const token = await accessToken(refresh);
  if (!token) return null;
  const calendars = await calendarsFor(token);
  if (!calendars) return null;
  const timeMin = `${addDays(start, -1)}T00:00:00Z`;
  const timeMax = `${addDays(end, 1)}T00:00:00Z`;
  const batches = await Promise.all(calendars.slice(0, 30).map(async (calendar) => {
    const items: RawEvent[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const payload = await googleGet<{ items?: RawEvent[]; nextPageToken?: string }>(
        token,
        `/calendars/${encodeURIComponent(calendar.id)}/events?${params}`,
      );
      items.push(...(payload?.items ?? []));
      pageToken = payload?.nextPageToken;
      if (!pageToken) break;
    }
    return items.flatMap((event) => expand(event, calendar, timeZone));
  }));
  return batches.flat().filter((event) => event.day >= start && event.day < end);
}

export type NewEvent = {
  title: string;
  notes?: string;
  day: string;
  time?: string | null;
  minutes?: number;
  timeZone?: string;
  calendarId?: string;
};

export type CreateResult =
  | { ok: true; event: GoogleEvent }
  | { ok: false; reason: "auth" | "scope" | "failed" };

function addMinutes(day: string, time: string, minutes: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const value = new Date(Date.UTC(year, month - 1, date, hour, minute + minutes));
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:00`;
}

export async function createEvent(refresh: string, input: NewEvent): Promise<CreateResult> {
  const token = await accessToken(refresh);
  if (!token) return { ok: false, reason: "auth" };
  const calendarId = input.calendarId || "primary";
  const timeZone = input.timeZone || "UTC";
  const timed = Boolean(input.time && /^\d{2}:\d{2}$/.test(input.time));
  const body = timed
    ? {
        summary: input.title,
        description: input.notes || undefined,
        start: { dateTime: `${input.day}T${input.time}:00`, timeZone },
        end: { dateTime: addMinutes(input.day, input.time as string, Math.max(5, input.minutes ?? 60)), timeZone },
      }
    : {
        summary: input.title,
        description: input.notes || undefined,
        start: { date: input.day },
        end: { date: addDays(input.day, 1) },
      };
  const response = await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 401) return { ok: false, reason: "auth" };
  if (response.status === 403) return { ok: false, reason: "scope" };
  if (!response.ok) return { ok: false, reason: "failed" };
  const raw = (await response.json()) as RawEvent;
  const calendars = (await calendarsFor(token)) ?? [];
  const calendar = calendars.find((item) => item.id === calendarId || (calendarId === "primary" && item.primary))
    ?? { id: calendarId, name: "Calendar", color: "#4e81fb", primary: calendarId === "primary" };
  const [event] = expand(raw, calendar, input.timeZone);
  if (!event) return { ok: false, reason: "failed" };
  return { ok: true, event };
}

function expand(event: RawEvent, calendar: GoogleCalendar, timeZone: string | undefined): GoogleEvent[] {
  const start = event.start;
  const end = event.end;
  if (!start) return [];
  const base = {
    title: event.summary || "(No title)",
    color: calendar.color,
    calendarId: calendar.id,
    calendar: calendar.name,
    link: event.htmlLink || "https://calendar.google.com",
  };
  if (start.date) {
    const days: GoogleEvent[] = [];
    let cursor = start.date;
    const stop = end?.date ?? addDays(start.date, 1);
    while (cursor < stop && days.length < 40) {
      days.push({ ...base, id: `${event.id ?? cursor}:${cursor}`, day: cursor, time: null, allDay: true });
      cursor = addDays(cursor, 1);
    }
    return days;
  }
  if (!start.dateTime) return [];
  const local = localParts(start.dateTime, timeZone);
  return [{
    ...base,
    id: event.id ?? start.dateTime,
    day: local.day,
    time: local.time,
    allDay: false,
  }];
}
