import {
  KINDS,
  emptySnapshot,
  type Kind,
  type Manifest,
  type Snapshot,
} from "./model";
import { getText, listKeys, putText } from "./r2";

const MANIFEST_KEY = "planner/manifest.json";
const REVISION_KEY = "planner/revision.txt";
const CHANGE_LIMIT = 400;

function recordKey(kind: Kind, id: string): string {
  return `planner/${kind}/${id}.json`;
}

export async function readManifest(): Promise<Manifest> {
  const text = await getText(MANIFEST_KEY);
  if (!text) return { revision: 0, updatedAt: new Date(0).toISOString(), changes: [] };
  const parsed = JSON.parse(text) as Manifest;
  return { revision: parsed.revision ?? 0, updatedAt: parsed.updatedAt, changes: parsed.changes ?? [] };
}

export async function readRevision(): Promise<number> {
  const text = await getText(REVISION_KEY);
  const parsed = text ? Number(text) : Number.NaN;
  if (Number.isFinite(parsed)) return parsed;
  const manifest = await readManifest();
  await putText(REVISION_KEY, String(manifest.revision));
  return manifest.revision;
}

export async function readSnapshot(after = 0): Promise<Snapshot> {
  const manifest = await readManifest();
  if (after > 0 && manifest.revision === after) {
    return { ...emptySnapshot(manifest.revision), reset: false };
  }
  const tooOld = after > 0 && !manifest.changes.some((change) => change.revision <= after);
  const full = after <= 0 || tooOld || manifest.changes.length === 0;
  const wanted = new Set(
    full ? [] : manifest.changes.filter((change) => change.revision > after).map((change) => `${change.kind}/${change.id}`),
  );
  const snapshot = emptySnapshot(manifest.revision);
  snapshot.reset = full;
  for (const kind of KINDS) {
    if (!full && !manifest.changes.some((change) => change.revision > after && change.kind === kind)) {
      snapshot[kind] = [];
      continue;
    }
    const keys = full ? await listKeys(`planner/${kind}/`) : [];
    const ids = full
      ? keys.map((key) => key.split("/").pop()?.replace(/\.json$/, "") ?? "").filter(Boolean)
      : manifest.changes.filter((change) => change.kind === kind && change.revision > after).map((change) => change.id);
    const unique = [...new Set(ids)];
    const records = await Promise.all(
      unique
        .filter((id) => full || wanted.has(`${kind}/${id}`))
        .map(async (id) => {
          const text = await getText(recordKey(kind, id));
          return text ? (JSON.parse(text) as Snapshot[Kind][number]) : null;
        }),
    );
    snapshot[kind] = records.filter((record): record is Snapshot[Kind][number] => record != null) as never;
  }
  return snapshot;
}

export async function writeRecords(baseRevision: number, incoming: Partial<Snapshot>): Promise<Snapshot | { conflict: Snapshot }> {
  const manifest = await readManifest();
  if (baseRevision !== manifest.revision) {
    return { conflict: await readSnapshot(baseRevision) };
  }
  const nextRevision = manifest.revision + 1;
  const changes = [...manifest.changes];
  for (const kind of KINDS) {
    const records = incoming[kind] ?? [];
    for (const record of records) {
      await putText(recordKey(kind, record.id), JSON.stringify(record));
      changes.push({ revision: nextRevision, kind, id: record.id });
    }
  }
  const nextManifest: Manifest = {
    revision: nextRevision,
    updatedAt: new Date().toISOString(),
    changes: changes.slice(-CHANGE_LIMIT),
  };
  await putText(MANIFEST_KEY, JSON.stringify(nextManifest));
  await putText(REVISION_KEY, String(nextRevision));
  const snapshot = emptySnapshot(nextRevision);
  snapshot.reset = false;
  for (const kind of KINDS) {
    const records = incoming[kind];
    if (records) snapshot[kind] = records as never;
  }
  return snapshot;
}
