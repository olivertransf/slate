import { addDays } from "@/lib/model";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
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

function localDay(value: string): string {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function localTime(value: string): string {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

type RawEvent = {
  id?: string;
  summary?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

export async function listEvents(refresh: string, start: string, end: string): Promise<GoogleEvent[] | null> {
  const token = await accessToken(refresh);
  if (!token) return null;
  const calendars = await calendarsFor(token);
  if (!calendars) return null;
  const timeMin = new Date(`${start}T00:00:00`).toISOString();
  const timeMax = new Date(`${end}T00:00:00`).toISOString();
  const batches = await Promise.all(calendars.slice(0, 8).map(async (calendar) => {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const payload = await googleGet<{ items?: RawEvent[] }>(token, `/calendars/${encodeURIComponent(calendar.id)}/events?${params}`);
    return (payload?.items ?? []).flatMap((event) => expand(event, calendar));
  }));
  return batches.flat();
}

function expand(event: RawEvent, calendar: GoogleCalendar): GoogleEvent[] {
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
  return [{
    ...base,
    id: event.id ?? start.dateTime,
    day: localDay(start.dateTime),
    time: localTime(start.dateTime),
    allDay: false,
  }];
}
