import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseQuickAdd } from "./quick-add.ts";

describe("parseQuickAdd", () => {
  it("pulls a date, time, priority, tag, and repeat out of the title", () => {
    const draft = parseQuickAdd("Ship notes tomorrow 3pm p1 #home daily", "2026-10-14");
    assert.equal(draft.title, "Ship notes");
    assert.equal(draft.dueOn, "2026-10-15");
    assert.equal(draft.dueTime, "15:00");
    assert.equal(draft.priority, 1);
    assert.deepEqual(draft.tagNames, ["home"]);
    assert.deepEqual(draft.repeat, { every: 1, unit: "day" });
  });

  it("rolls a weekday forward", () => {
    const draft = parseQuickAdd("Practice monday", "2026-10-14");
    assert.equal(draft.dueOn, "2026-10-19");
    assert.equal(draft.title, "Practice");
  });

  it("treats tmrw as tomorrow and drops it from the title", () => {
    const draft = parseQuickAdd("run tmrw", "2026-10-14");
    assert.equal(draft.title, "run");
    assert.equal(draft.dueOn, "2026-10-15");
    assert.equal(draft.tokens[0]?.text, "tmrw");
    assert.equal(draft.tokens[0]?.kind, "date");
  });

  it("accepts the short aliases people actually type", () => {
    assert.equal(parseQuickAdd("stretch tod", "2026-10-14").dueOn, "2026-10-14");
    assert.equal(parseQuickAdd("call tom 9am", "2026-10-14").dueTime, "09:00");
    assert.equal(parseQuickAdd("call tom 9am", "2026-10-14").title, "call");
    assert.equal(parseQuickAdd("pack in 3 days", "2026-10-14").dueOn, "2026-10-17");
  });
});
