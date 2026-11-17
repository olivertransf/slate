import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { importTickTick, type TickTickExport } from "../lib/ticktick-import.ts";
import { sanitizeRecords } from "../lib/records.ts";
import { KINDS, type Snapshot } from "../lib/model.ts";

const directory = resolve(".slate-local/migrations");
await mkdir(directory, { recursive: true, mode: 0o700 });
const source = JSON.parse(await readFile(resolve(directory, "ticktick-source.json"), "utf8")) as TickTickExport;
await chmod(resolve(directory, "ticktick-source.json"), 0o600);
const url = process.env.SLATE_IMPORT_URL ?? "http://127.0.0.1:3000";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) throw new Error("Use the local Slate preview for this import.");
const auth = await fetch(`${url}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passphrase: (await readFile(".passphrase", "utf8")).trim(), device: "ticktick-import" }) });
if (!auth.ok) throw new Error(`Could not unlock Slate (${auth.status}).`);
const cookie = auth.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("No session returned.");
async function snapshot() {
  const response = await fetch(`${url}/api/sync`, { headers: { Cookie: cookie! } });
  if (!response.ok) throw new Error(`Could not read Slate (${response.status}).`);
  return await response.json() as Snapshot;
}
const before = await snapshot();
const backup = resolve(directory, `slate-before-ticktick-${Date.now()}.json`);
await writeFile(backup, JSON.stringify(before), { mode: 0o600, flag: "wx" });
const { records, skipped, warnings } = importTickTick(source, before);
const valid = sanitizeRecords(records);
if (valid.rejected) throw new Error(`${valid.rejected} invalid records; nothing imported.`);
const expected = Object.fromEntries(KINDS.map((kind) => [kind, records[kind].length]));
if (process.argv.includes("--apply")) {
  const response = await fetch(`${url}/api/sync`, { method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ baseRevision: before.revision, records: valid.records, mutationId: `ticktick-${randomUUID()}` }) });
  if (!response.ok) throw new Error(`Import was not applied (${response.status}); rerun after syncing.`);
  const after = await snapshot();
  for (const kind of KINDS) for (const record of records[kind]) {
    const saved = after[kind].find((item) => item.id === record.id);
    if (!saved || !isDeepStrictEqual(saved, valid.records[kind]?.find((item) => item.id === record.id))) throw new Error(`Verification failed for ${kind}/${record.id}.`);
  }
  const retry = importTickTick(source, after);
  if (KINDS.some((kind) => retry.records[kind].length)) throw new Error("Repeat import would create duplicates.");
  await writeFile(resolve(directory, "ticktick-import-report.json"), JSON.stringify({ importedAt: new Date().toISOString(), expected, skipped, warnings, backup, revision: after.revision }), { mode: 0o600 });
  console.log(JSON.stringify({ applied: true, counts: expected, skipped, warnings: warnings.length, backup, verified: true, repeatImportAdds: 0 }));
} else console.log(JSON.stringify({ preview: true, counts: expected, skipped, warnings, backup }));
