import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeByUpdatedAt, preferRecord } from "./merge.ts";

describe("mergeByUpdatedAt", () => {
  it("keeps the newer edit and the newer tombstone", () => {
    const local: { id: string; title: string; updatedAt: string; deletedAt: string | null }[] = [
      { id: "a", title: "local", updatedAt: "2026-10-15T12:00:00.500Z", deletedAt: null },
      { id: "b", title: "kept", updatedAt: "2026-10-15T12:00:00.000Z", deletedAt: null },
    ];
    const remote: { id: string; title: string; updatedAt: string; deletedAt: string | null }[] = [
      { id: "a", title: "remote", updatedAt: "2026-10-15T12:00:00Z", deletedAt: null },
      { id: "b", title: "kept", updatedAt: "2026-10-15T13:00:00.000Z", deletedAt: "2026-10-15T13:00:00.000Z" },
    ];
    const merged = mergeByUpdatedAt(local, remote);
    assert.equal(merged.find((item) => item.id === "a")?.title, "local");
    assert.equal(merged.find((item) => item.id === "b")?.deletedAt, "2026-10-15T13:00:00.000Z");
  });

  it("prefers an equal timestamp from the incoming record", () => {
    const chosen = preferRecord(
      { id: "a", updatedAt: "2026-10-15T12:00:00.000Z", title: "old" },
      { id: "a", updatedAt: "2026-10-15T12:00:00.000Z", title: "new" },
    );
    assert.equal(chosen.title, "new");
  });
});
