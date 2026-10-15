import { readToken, tokenValid } from "@/lib/session";
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

function authorized(request: Request): boolean {
  try {
    return tokenValid(readToken(request));
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return denied();
  const url = new URL(request.url);
  if (url.searchParams.get("manifest") === "1") {
    const revision = await readRevision();
    const etag = `"${revision}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
    }
    return Response.json(
      { revision },
      { headers: { ETag: etag, "Cache-Control": "no-store" } },
    );
  }
  const after = Number(url.searchParams.get("after") ?? "0");
  const snapshot = await readSnapshot(Number.isFinite(after) ? after : 0);
  return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  if (!authorized(request)) return denied();
  const body = (await request.json().catch(() => null)) as { baseRevision?: number; records?: Partial<Snapshot> } | null;
  if (!body || typeof body.baseRevision !== "number" || !body.records) {
    return Response.json({ error: "Missing revision." }, { status: 400 });
  }
  const records: Partial<Snapshot> = {};
  for (const kind of KINDS) {
    const list = body.records[kind];
    if (!Array.isArray(list)) continue;
    assignKind(records, kind, list.filter((record) => record && typeof record.id === "string"));
  }
  const result = await writeRecords(body.baseRevision, records);
  if ("conflict" in result) {
    return Response.json({ conflict: true, snapshot: result.conflict }, { status: 409 });
  }
  return Response.json(result);
}
