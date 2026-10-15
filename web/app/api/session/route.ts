import { bumpEpoch, currentEpoch, requestAllowed } from "@/lib/access";
import { logEvent } from "@/lib/log";
import { clientIp, tooMany } from "@/lib/rate-limit";
import { clearCookie, deviceId, issueToken, readToken, renewToken, sessionCookie, verifyPassphrase } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { passphrase?: string; device?: string; renew?: boolean } | null;
  if (body?.renew) {
    const token = readToken(request);
    if (!(await requestAllowed(request)) || !token) {
      return Response.json({ error: "Unlock required." }, { status: 401 });
    }
    const next = renewToken(token) ?? token;
    return Response.json({ token: next }, { headers: { "Set-Cookie": sessionCookie(next), "Cache-Control": "no-store" } });
  }
  if (await tooMany(clientIp(request))) {
    logEvent("auth.limited", {});
    return Response.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 });
  }
  const stored = process.env.SYNC_PASSPHRASE_HASH;
  if (!stored || !process.env.SESSION_SECRET) {
    return Response.json({ error: "The server passphrase is not configured." }, { status: 503 });
  }
  const passphrase = body?.passphrase ?? "";
  if (!passphrase || !(await verifyPassphrase(passphrase, stored))) {
    logEvent("auth.rejected", {});
    return Response.json({ error: "That passphrase is wrong." }, { status: 401 });
  }
  const epoch = await currentEpoch();
  const token = issueToken(epoch, deviceId(body?.device ?? request.headers.get("x-slate-device")));
  logEvent("auth.unlocked", { epoch });
  return Response.json(
    { token },
    { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: Request) {
  if (await requestAllowed(request)) {
    const epoch = await bumpEpoch();
    logEvent("auth.revoked", { epoch });
  }
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookie(), "Cache-Control": "no-store" } });
}
