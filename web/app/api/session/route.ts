import { clearCookie, issueToken, sessionCookie, verifyPassphrase } from "@/lib/session";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; resetAt: number }>();

function limited(request: Request): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return false;
  }
  current.count += 1;
  return current.count > 12;
}

export async function POST(request: Request) {
  if (limited(request)) {
    return Response.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 });
  }
  const stored = process.env.SYNC_PASSPHRASE_HASH;
  if (!stored || !process.env.SESSION_SECRET) {
    return Response.json({ error: "The server passphrase is not configured." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { passphrase?: string } | null;
  const passphrase = body?.passphrase ?? "";
  if (!passphrase || !(await verifyPassphrase(passphrase, stored))) {
    return Response.json({ error: "That passphrase is wrong." }, { status: 401 });
  }
  const token = issueToken();
  return Response.json(
    { token },
    { headers: { "Set-Cookie": sessionCookie(token), "Cache-Control": "no-store" } },
  );
}

export function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookie() } });
}
