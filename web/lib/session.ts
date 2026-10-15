import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const COOKIE = "slate_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export type TokenClaims = {
  exp: number;
  epoch: number;
  device: string;
  legacy: boolean;
};

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

export function deviceId(value: string | null | undefined): string {
  const cleaned = (value ?? "web").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return cleaned || "web";
}

export function issueToken(epoch = 0, device = "web", now = Date.now()): string {
  const exp = Math.floor(now / 1000) + MAX_AGE_SECONDS;
  const payload = `${exp}.${epoch}.${deviceId(device)}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readClaims(token: string | null | undefined): TokenClaims | null {
  if (!token) return null;
  const bits = token.split(".");
  if (bits.length === 2) {
    const exp = Number(bits[0]);
    if (!Number.isFinite(exp)) return null;
    return { exp, epoch: 0, device: "legacy", legacy: true };
  }
  if (bits.length !== 4) return null;
  const exp = Number(bits[0]);
  const epoch = Number(bits[1]);
  if (!Number.isFinite(exp) || !Number.isFinite(epoch) || !bits[2]) return null;
  return { exp, epoch, device: bits[2], legacy: false };
}

function signatureMatches(payload: string, sig: string): boolean {
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const actual = Buffer.from(sig);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length) return false;
  return timingSafeEqual(actual, wanted);
}

export function tokenValid(token: string | null | undefined, now = Date.now()): boolean {
  const claims = readClaims(token);
  if (!token || !claims || claims.exp * 1000 < now) return false;
  const bits = token.split(".");
  if (claims.legacy) return signatureMatches(bits[0] ?? "", bits[1] ?? "");
  return signatureMatches(`${bits[0]}.${bits[1]}.${bits[2]}`, bits[3] ?? "");
}

export function renewToken(token: string, now = Date.now()): string | null {
  const claims = readClaims(token);
  if (!claims || claims.legacy || !tokenValid(token, now)) return null;
  if (claims.exp * 1000 - now > 2 * 24 * 60 * 60 * 1000) return null;
  return issueToken(claims.epoch, claims.device, now);
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
