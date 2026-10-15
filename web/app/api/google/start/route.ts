import { randomBytes } from "node:crypto";
import { authUrl, googleConfigured, stateCookie } from "@/lib/google";
import { saveOAuthState, sessionOk } from "@/lib/google-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!googleConfigured()) {
    return Response.json({ error: "Google Calendar is not configured on the server." }, { status: 503 });
  }
  const url = new URL(request.url);
  const app = url.searchParams.get("client") === "app";
  if (!sessionOk(request)) {
    if (app) return Response.json({ error: "Unlock required." }, { status: 401 });
    return Response.redirect(`${url.origin}/?google=locked`, 302);
  }
  const state = randomBytes(16).toString("base64url");
  await saveOAuthState(state, app);
  const location = authUrl(request, state);
  if (app) {
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", stateCookie(state));
    return Response.json({ url: location }, { headers });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Set-Cookie": stateCookie(state),
      "Cache-Control": "no-store",
    },
  });
}
