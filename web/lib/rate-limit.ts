import { createHash } from "node:crypto";
import { getText, putText } from "./r2";

const memory = new Map<string, { count: number; resetAt: number }>();

export async function tooMany(ip: string, max = 12, windowMs = 10 * 60 * 1000): Promise<boolean> {
  const now = Date.now();
  const key = createHash("sha256").update(ip).digest("hex").slice(0, 24);
  let current = memory.get(key);
  if (!current || current.resetAt < now) {
    const text = await getText(`private/ratelimit/${key}.json`).catch(() => null);
    const parsed = text ? (JSON.parse(text) as { count?: number; resetAt?: number }) : null;
    current = parsed?.resetAt && parsed.resetAt > now
      ? { count: parsed.count ?? 0, resetAt: parsed.resetAt }
      : { count: 0, resetAt: now + windowMs };
  }
  current.count += 1;
  memory.set(key, current);
  await putText(`private/ratelimit/${key}.json`, JSON.stringify(current)).catch(() => undefined);
  return current.count > max;
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
