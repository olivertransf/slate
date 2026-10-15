import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesView, nextDue, searchTasks, sortTasks, type TaskRecord } from "./model.ts";

function task(partial: Partial<TaskRecord> & Pick<TaskRecord, "id" | "title">): TaskRecord {
  return {
    notes: "",
    listId: null,
    sectionId: null,
    priority: 0,
    tagIds: [],
    dueOn: null,
    dueTime: null,
    repeat: null,
    remindMinutesBefore: null,
    completedAt: null,
    subtasks: [],
    sort: 0,
    updatedAt: "2026-10-15T00:00:00.000Z",
    deletedAt: null,
    ...partial,
  };
}

describe("planner queries", () => {
  it("advances a weekday rule to the next selected day", () => {
    const next = nextDue("2026-10-14", { every: 1, unit: "week", weekdays: [1, 3] }, "2026-10-14");
    assert.equal(next, "2026-10-19");
  });

  it("keeps the plain weekly interval when no weekdays are set", () => {
    assert.equal(nextDue("2026-10-14", { every: 2, unit: "week" }, "2026-10-14"), "2026-10-28");
  });

  it("separates overdue, completed, and trash from open views", () => {
    const overdue = task({ id: "1", title: "Late", dueOn: "2026-10-13" });
    const done = task({ id: "2", title: "Done", completedAt: "2026-10-15T00:00:00.000Z" });
    const gone = task({ id: "3", title: "Gone", deletedAt: "2026-10-15T00:00:00.000Z" });
    assert.equal(matchesView(overdue, "overdue", "2026-10-15"), true);
    assert.equal(matchesView(overdue, "today", "2026-10-15"), true);
    assert.equal(matchesView(done, "completed", "2026-10-15"), true);
    assert.equal(matchesView(done, "today", "2026-10-15"), false);
    assert.equal(matchesView(gone, "trash", "2026-10-15"), true);
    assert.equal(matchesView(gone, "inbox", "2026-10-15"), false);
  });

  it("searches titles and sorts by priority", () => {
    const tasks = [
      task({ id: "1", title: "Walk", notes: "park", priority: 1, sort: 2 }),
      task({ id: "2", title: "Wear black", priority: 3, sort: 1 }),
    ];
    assert.deepEqual(searchTasks(tasks, "park").map((item) => item.id), ["1"]);
    assert.deepEqual(sortTasks(tasks, "priority").map((item) => item.id), ["2", "1"]);
  });
});
