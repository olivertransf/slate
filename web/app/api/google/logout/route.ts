import { clearRefreshCookie, clearStateCookie } from "@/lib/google";
import { clearGoogleRefresh, sessionOk } from "@/lib/google-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await sessionOk(request))) return Response.json({ error: "Unlock required." }, { status: 401 });
  await clearGoogleRefresh().catch(() => undefined);
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", clearRefreshCookie());
  headers.append("Set-Cookie", clearStateCookie());
  return Response.json({ ok: true }, { headers });
}
