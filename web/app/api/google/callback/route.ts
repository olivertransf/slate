import { clearStateCookie, exchangeCode, googleConfigured, readState, refreshCookie } from "@/lib/google";
import { consumeOAuthState, saveGoogleRefresh } from "@/lib/google-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const fail = (reason: string) => Response.redirect(`${origin}/?google=${encodeURIComponent(reason)}`, 302);
  if (!googleConfigured()) return fail("missing-config");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("denied");
  const cookieMatch = state === readState(request);
  const stored = await consumeOAuthState(state).catch(() => null);
  if (!cookieMatch && !stored) return fail("denied");
  const tokens = await exchangeCode(request, code);
  if (!tokens.refresh_token) return fail("token");
  try {
    await saveGoogleRefresh(tokens.refresh_token);
  } catch {
    if (stored?.app) return fail("store");
  }
  const done = stored?.app ? "slate://google-connected" : `${origin}/?google=connected`;
  const headers = new Headers({ Location: done, "Cache-Control": "no-store" });
  headers.append("Set-Cookie", refreshCookie(tokens.refresh_token));
  headers.append("Set-Cookie", clearStateCookie());
  return new Response(null, { status: 302, headers });
}
