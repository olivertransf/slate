import { randomUUID } from "node:crypto";
import { getBytes, putBytes } from "@/lib/r2";
import { readToken, tokenValid } from "@/lib/session";

export const runtime = "nodejs";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function authorized(request: Request): boolean {
  try {
    return tokenValid(readToken(request));
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unlock required." }, { status: 401 });
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!key.startsWith("planner/files/")) return Response.json({ error: "Missing file." }, { status: 400 });
  const file = await getBytes(key);
  if (!file) return Response.json({ error: "Missing file." }, { status: 404 });
  return new Response(Buffer.from(file.body), {
    headers: { "Content-Type": file.type, "Cache-Control": "private, max-age=3600" },
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unlock required." }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Missing file." }, { status: 400 });
  if (!TYPES.has(file.type)) return Response.json({ error: "Use a JPEG, PNG, WebP, or GIF." }, { status: 400 });
  if (file.size > 5_000_000) return Response.json({ error: "Images must be under 5 MB." }, { status: 400 });
  const key = `planner/files/${randomUUID()}`;
  await putBytes(key, new Uint8Array(await file.arrayBuffer()), file.type);
  return Response.json({ key });
}
