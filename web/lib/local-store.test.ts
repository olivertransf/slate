import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localGet, localPut, localDelete, localKeys } from "./local-store.ts";

test("local store persists bytes, isolates keys, filters prefixes, and deletes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "slate-store-"));
  const previous = process.env.SLATE_LOCAL_DIR;
  process.env.SLATE_LOCAL_DIR = dir;
  try {
    assert.equal(await localGet("missing"), null);
    await localPut("planner/tasks/one", Buffer.from("first"), "text/plain");
    await localPut("../../outside", new Uint8Array([0, 255, 128]), "image/png");
    await localPut("planner/tasks/one", Buffer.from("updated"), "application/json");
    const value = await localGet("planner/tasks/one");
    assert.equal(Buffer.from(value!.body).toString(), "updated");
    assert.equal(value!.type, "application/json");
    assert.deepEqual(Array.from((await localGet("../../outside"))!.body), [0, 255, 128]);
    assert.deepEqual(await localKeys("planner/tasks/"), ["planner/tasks/one"]);
    assert.equal((await readdir(dir)).length, 2);
    await localDelete("planner/tasks/one");
    await localDelete("planner/tasks/one");
    assert.equal(await localGet("planner/tasks/one"), null);
  } finally {
    if (previous === undefined) delete process.env.SLATE_LOCAL_DIR;
    else process.env.SLATE_LOCAL_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
