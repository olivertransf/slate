import { getText, putText } from "./r2";
import { readClaims, readToken, tokenValid } from "./session";

const EPOCH_KEY = "planner/session-epoch.txt";
let cached: { epoch: number; at: number } | null = null;

export async function currentEpoch(): Promise<number> {
  if (cached && Date.now() - cached.at < 5000) return cached.epoch;
  const text = await getText(EPOCH_KEY).catch(() => null);
  const epoch = text && Number.isFinite(Number(text)) ? Number(text) : 0;
  cached = { epoch, at: Date.now() };
  return epoch;
}

export async function bumpEpoch(): Promise<number> {
  const next = (await currentEpoch()) + 1;
  await putText(EPOCH_KEY, String(next));
  cached = { epoch: next, at: Date.now() };
  return next;
}

export async function requestAllowed(request: Request): Promise<boolean> {
  try {
    const token = readToken(request);
    if (!tokenValid(token)) return false;
    const claims = readClaims(token);
    if (!claims) return false;
    const epoch = await currentEpoch();
    if (claims.legacy) return epoch === 0;
    return claims.epoch === epoch;
  } catch {
    return false;
  }
}
