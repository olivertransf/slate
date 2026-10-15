import { logEvent } from "./log";
import { mergeLists, preferRecord, sameRecord } from "./merge";
import {
  KINDS,
  SCHEMA_VERSION,
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
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: parsed.revision ?? 0,
    updatedAt: parsed.updatedAt,
    changes: parsed.changes ?? [],
    mutations: parsed.mutations ?? [],
  };
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

const MUTATION_LIMIT = 200;

export async function writeRecords(
  baseRevision: number,
  incoming: Partial<Snapshot>,
  mutationId?: string,
): Promise<Snapshot | { conflict: Snapshot }> {
  const manifest = await readManifest();
  const mutations = manifest.mutations ?? [];
  if (mutationId && mutations.includes(mutationId)) {
    logEvent("sync.duplicate", { revision: manifest.revision });
    const snapshot = emptySnapshot(manifest.revision);
    snapshot.reset = false;
    return snapshot;
  }
  if (baseRevision !== manifest.revision) {
    logEvent("sync.conflict", { baseRevision, revision: manifest.revision });
    return { conflict: await readSnapshot(baseRevision) };
  }
  const nextRevision = manifest.revision + 1;
  const changes = [...manifest.changes];
  let wrote = false;
  const applied = emptySnapshot(nextRevision);
  applied.reset = false;
  for (const kind of KINDS) {
    const records = incoming[kind] ?? [];
    const winners: Snapshot[Kind] = [];
    for (const record of records) {
      const text = await getText(recordKey(kind, record.id));
      const existing = text ? (JSON.parse(text) as Snapshot[Kind][number]) : undefined;
      const chosen = preferRecord(existing, record);
      if (!existing || !sameRecord(existing, chosen)) {
        await putText(recordKey(kind, record.id), JSON.stringify(chosen));
        changes.push({ revision: nextRevision, kind, id: record.id });
        wrote = true;
      }
      winners.push(chosen as never);
    }
    applied[kind] = winners as never;
  }
  const revision = wrote ? nextRevision : manifest.revision;
  applied.revision = revision;
  if (wrote || mutationId) {
    const nextManifest: Manifest = {
      schemaVersion: SCHEMA_VERSION,
      revision,
      updatedAt: new Date().toISOString(),
      changes: changes.slice(-CHANGE_LIMIT),
      mutations: mutationId ? [...mutations, mutationId].slice(-MUTATION_LIMIT) : mutations,
    };
    await putText(MANIFEST_KEY, JSON.stringify(nextManifest));
    await putText(REVISION_KEY, String(revision));
  }
  logEvent("sync.write", { revision, wrote, kinds: KINDS.filter((kind) => (incoming[kind]?.length ?? 0) > 0).join(",") });
  return applied;
}

export function mergeSnapshot(local: Snapshot, remote: Snapshot): Snapshot {
  if (remote.reset) return { ...remote, schemaVersion: SCHEMA_VERSION };
  const next = emptySnapshot(remote.revision);
  next.reset = false;
  for (const kind of KINDS) {
    next[kind] = mergeLists(local[kind], remote[kind]) as never;
  }
  return next;
}
