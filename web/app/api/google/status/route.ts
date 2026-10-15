import { googleConfigured, listCalendars } from "@/lib/google";
import { refreshFor, sessionOk } from "@/lib/google-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!googleConfigured()) {
    return Response.json({ configured: false, connected: false, calendars: [] });
  }
  if (!(await sessionOk(request))) {
    return Response.json({ error: "Unlock required." }, { status: 401 });
  }
  const refresh = await refreshFor(request);
  if (!refresh) return Response.json({ configured: true, connected: false, calendars: [] });
  const calendars = await listCalendars(refresh);
  if (!calendars) {
    return Response.json({ configured: true, connected: false, calendars: [] }, { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ configured: true, connected: true, calendars }, { headers: { "Cache-Control": "no-store" } });
}
