import { requestAllowed } from "@/lib/access";
import { logEvent } from "@/lib/log";
import { readToken, renewToken, sessionCookie } from "@/lib/session";
import { sanitizeRecords } from "@/lib/records";
import { readRevision, readSnapshot, writeRecords } from "@/lib/snapshot";
import { KINDS, type Kind, type Snapshot } from "@/lib/model";

export const runtime = "nodejs";

function assignKind(records: Partial<Snapshot>, kind: Kind, list: unknown[]): void {
  switch (kind) {
    case "lists":
      records.lists = list as Snapshot["lists"];
      return;
    case "tasks":
      records.tasks = list as Snapshot["tasks"];
      return;
    case "tags":
      records.tags = list as Snapshot["tags"];
      return;
    case "habits":
      records.habits = list as Snapshot["habits"];
      return;
    case "habitChecks":
      records.habitChecks = list as Snapshot["habitChecks"];
      return;
    case "countdowns":
      records.countdowns = list as Snapshot["countdowns"];
      return;
    default: {
      const unreachable: never = kind;
      throw new Error(`Unknown kind ${unreachable}`);
    }
  }
}

function denied() {
  return Response.json({ error: "Unlock required." }, { status: 401 });
}

function renewal(request: Request): Headers {
  const headers = new Headers({ "Cache-Control": "no-store" });
  const next = renewToken(readToken(request) ?? "");
  if (next) headers.set("Set-Cookie", sessionCookie(next));
  return headers;
}

export async function GET(request: Request) {
  if (!(await requestAllowed(request))) return denied();
  const headers = renewal(request);
  const url = new URL(request.url);
  if (url.searchParams.get("manifest") === "1") {
    const revision = await readRevision();
    const etag = `"${revision}"`;
    if (request.headers.get("if-none-match") === etag) {
      headers.set("ETag", etag);
      return new Response(null, { status: 304, headers });
    }
    headers.set("ETag", etag);
    return Response.json({ revision }, { headers });
  }
  const after = Number(url.searchParams.get("after") ?? "0");
  const snapshot = await readSnapshot(Number.isFinite(after) ? after : 0);
  return Response.json(snapshot, { headers });
}

export async function PUT(request: Request) {
  if (!(await requestAllowed(request))) return denied();
  const body = (await request.json().catch(() => null)) as {
    baseRevision?: number;
    records?: Partial<Snapshot>;
    mutationId?: string;
  } | null;
  if (!body || typeof body.baseRevision !== "number" || !body.records) {
    return Response.json({ error: "Missing revision." }, { status: 400 });
  }
  const mutationId = typeof body.mutationId === "string" && body.mutationId.length <= 80 ? body.mutationId : undefined;
  const sanitized = sanitizeRecords(body.records);
  if (sanitized.rejected > 0) logEvent("sync.rejected", { count: sanitized.rejected });
  const records: Partial<Snapshot> = {};
  for (const kind of KINDS) {
    const list = sanitized.records[kind];
    if (!Array.isArray(list) || list.length === 0) continue;
    assignKind(records, kind, list);
  }
  const result = await writeRecords(body.baseRevision, records, mutationId);
  if ("conflict" in result) {
    return Response.json({ conflict: true, snapshot: result.conflict }, { status: 409 });
  }
  return Response.json(result);
}
