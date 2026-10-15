import { listEvents } from "@/lib/google";
import { refreshFor, sessionOk } from "@/lib/google-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!sessionOk(request)) return Response.json({ error: "Unlock required." }, { status: 401 });
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
