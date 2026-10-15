import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const COOKIE = "slate_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

export function cookieName(): string {
  return COOKIE;
}

export async function hashPassphrase(passphrase: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(passphrase, salt, 32)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassphrase(passphrase: string, stored: string): Promise<boolean> {
  const [kind, saltText, hashText] = stored.split("$");
  if (kind !== "scrypt" || !saltText || !hashText) return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(hashText, "base64url");
  const actual = (await scryptAsync(passphrase, salt, expected.length)) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not set.");
  return value;
}

export function issueToken(now = Date.now()): string {
  const exp = Math.floor(now / 1000) + MAX_AGE_SECONDS;
  const sig = createHmac("sha256", secret()).update(String(exp)).digest("base64url");
  return `${exp}.${sig}`;
}

export function tokenValid(token: string | null | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [expText, sig] = token.split(".");
  if (!expText || !sig) return false;
  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = createHmac("sha256", secret()).update(expText).digest("base64url");
  const actual = Buffer.from(sig);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length) return false;
  return timingSafeEqual(actual, wanted);
}

export function sessionCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function clearCookie(): string {
  return `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

export function readToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
