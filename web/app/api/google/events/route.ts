import { createEvent, listEvents } from "@/lib/google";
import { refreshFor, sessionOk } from "@/lib/google-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export async function GET(request: Request) {
  if (!(await sessionOk(request))) return Response.json({ error: "Unlock required." }, { status: 401 });
  const refresh = await refreshFor(request);
  if (!refresh) return Response.json({ events: [] });
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!start || !end) return Response.json({ error: "Missing range." }, { status: 400 });
  const events = await listEvents(refresh, start, end);
  if (!events) return Response.json({ events: [] });
  return Response.json({ events }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await sessionOk(request))) return Response.json({ error: "Unlock required." }, { status: 401 });
  const refresh = await refreshFor(request);
  if (!refresh) return Response.json({ error: "Connect Google Calendar first." }, { status: 409 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 500) : "";
  const day = typeof body?.day === "string" ? body.day : "";
  const time = typeof body?.time === "string" && TIME.test(body.time) ? body.time : null;
  if (!title || !DAY.test(day)) return Response.json({ error: "A title and a date are required." }, { status: 400 });
  const minutes = typeof body?.minutes === "number" && Number.isFinite(body.minutes) ? Math.min(24 * 60, Math.round(body.minutes)) : 60;
  const timeZone = typeof body?.timeZone === "string" && body.timeZone.length < 64 ? body.timeZone : undefined;
  const notes = typeof body?.notes === "string" ? body.notes.slice(0, 8000) : undefined;
  const result = await createEvent(refresh, { title, notes, day, time, minutes, timeZone });
  if (result.ok) return Response.json({ event: result.event }, { headers: { "Cache-Control": "no-store" } });
  if (result.reason === "scope") {
    return Response.json({ error: "Reconnect Google Calendar to allow creating events.", reconnect: true }, { status: 403 });
  }
  if (result.reason === "auth") {
    return Response.json({ error: "Google sign-in expired. Reconnect Google Calendar.", reconnect: true }, { status: 403 });
  }
  return Response.json({ error: "Google Calendar did not create the event." }, { status: 502 });
}
