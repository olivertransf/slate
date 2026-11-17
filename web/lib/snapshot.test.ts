import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TagRecord } from "./model.ts";
import { readRevision, readSnapshot, writeRecords } from "./snapshot.ts";

function tag(id: string): TagRecord {
  return { id, name: id, color: "#8c5efa", updatedAt: "2026-11-15T12:00:00.000Z", deletedAt: null };
}

test("sync serializes competing writes and catches up after an acknowledged retry or reset", async () => {
  const directory = await mkdtemp(join(tmpdir(), "slate-sync-"));
  process.env.SLATE_STORAGE = "local";
  process.env.SLATE_LOCAL_DIR = directory;
  try {
    const [first, second] = await Promise.all([
      writeRecords(0, { tags: [tag("first")] }, "mutation-1"),
      writeRecords(0, { tags: [tag("second")] }, "mutation-2"),
    ]);
    assert.ok("revision" in first && first.revision === 1);
    assert.ok("conflict" in second && second.conflict.revision === 1);
    await writeRecords(1, { tags: [tag("second")] }, "mutation-2");

    const retry = await writeRecords(0, { tags: [tag("first")] }, "mutation-1");
    assert.ok("revision" in retry);
    assert.deepEqual(retry.tags.map((record) => record.id), ["first", "second"]);
    assert.equal(await readRevision(), 2);
    const reset = await readSnapshot(30);
    assert.equal(reset.reset, true);
    assert.equal(reset.revision, 2);
    assert.equal(reset.tags.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
