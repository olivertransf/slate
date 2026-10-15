import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getText, putText } from "@/lib/r2";
import { readToken, tokenValid } from "@/lib/session";
import { readRefresh } from "@/lib/google";

const REFRESH_KEY = "private/google-refresh.json";
const STATE_KEY = "private/google-state.json";

export function sessionOk(request: Request): boolean {
  try {
    return tokenValid(readToken(request));
  } catch {
    return false;
  }
}

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set.");
  return createHash("sha256").update(secret).digest();
}

export async function saveGoogleRefresh(token: string): Promise<void> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  await putText(
    REFRESH_KEY,
    JSON.stringify({
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      data: data.toString("base64url"),
    }),
  );
}

export async function loadGoogleRefresh(): Promise<string | null> {
  const text = await getText(REFRESH_KEY);
  if (!text) return null;
  const parsed = JSON.parse(text) as { iv?: string; tag?: string; data?: string };
  if (!parsed.iv || !parsed.tag || !parsed.data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(parsed.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(parsed.data, "base64url")), decipher.final()]);
    return plain.toString("utf8") || null;
  } catch {
    return null;
  }
}

export async function clearGoogleRefresh(): Promise<void> {
  await putText(REFRESH_KEY, JSON.stringify({ cleared: true }));
}

export async function refreshFor(request: Request): Promise<string | null> {
  if (!sessionOk(request)) return null;
  const cookie = readRefresh(request);
  const stored = await loadGoogleRefresh().catch(() => null);
  if (cookie) {
    if (cookie !== stored) {
      try {
        await saveGoogleRefresh(cookie);
      } catch {
        return cookie;
      }
    }
    return cookie;
  }
  return stored;
}

export async function saveOAuthState(state: string, app: boolean): Promise<void> {
  await putText(STATE_KEY, JSON.stringify({ state, exp: Date.now() + 10 * 60 * 1000, app }));
}

export async function consumeOAuthState(state: string): Promise<{ app: boolean } | null> {
  const text = await getText(STATE_KEY);
  if (!text) return null;
  const parsed = JSON.parse(text) as { state?: string; exp?: number; app?: boolean };
  if (parsed.state !== state || !parsed.exp || parsed.exp < Date.now()) return null;
  await putText(STATE_KEY, JSON.stringify({ cleared: true }));
  return { app: Boolean(parsed.app) };
}
