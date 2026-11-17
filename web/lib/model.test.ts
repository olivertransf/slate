import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesView, nextDue, nextTaskDue, searchTasks, sortTasks, type TaskRecord } from "./model.ts";

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

it("uses planned start dates without treating them as overdue deadlines", () => {
  const planned = task({ id: "1", title: "Plan", startOn: "2026-10-15", dueOn: "2026-10-22" });
  assert.equal(matchesView(planned, "today", "2026-10-15"), true);
  assert.equal(matchesView(planned, "overdue", "2026-10-16"), false);
  assert.equal(matchesView(planned, "upcoming", "2026-10-14"), true);
  assert.equal(matchesView(planned, "anytime", "2026-10-14"), false);
  assert.equal(matchesView(planned, "anytime", "2026-10-16"), true);
});

it("ranks title matches ahead of notes matches", () => {
  const note = task({ id: "1", title: "Walk", notes: "park" });
  const title = task({ id: "2", title: "Park cleanup" });
  assert.deepEqual(searchTasks([note, title], "park").map((item) => item.id), ["2", "1"]);
});

it("defers Someday work while keeping its deadline actionable", () => {
  const deferred = task({ id: "1", title: "Deferred", someday: true, startOn: "2026-10-15" });
  const day = "2026-10-15";
  assert.equal(matchesView(deferred, "someday", day), true);
  assert.equal(matchesView(deferred, "inbox", day), false);
  assert.equal(matchesView(deferred, "today", day), false);
  assert.equal(matchesView({ ...deferred, dueOn: day }, "today", day), true);
});

it("advances repeats from their configured anchor and respects the end date", () => {
  const repeating = task({ id: "1", title: "Repeat", dueOn: "2026-10-15", repeat: { every: 1, unit: "week" } });
  assert.equal(nextTaskDue(repeating, "2026-10-17"), "2026-10-22");
  assert.equal(nextTaskDue({ ...repeating, repeatAfterCompletion: true }, "2026-10-17"), "2026-10-24");
  assert.equal(nextTaskDue({ ...repeating, repeatUntil: "2026-10-21" }, "2026-10-17"), null);
});

it("date navigation matches only the selected due or planned day", () => {
  const task = { id: "date-check", title: "Check", listId: null, sectionId: null, dueOn: "2026-11-06", startOn: null, someday: false, completedAt: null, deletedAt: null } as import("./model.ts").TaskRecord;
  assert.equal(matchesView(task, "date:2026-11-06", "2026-11-05"), true);
  assert.equal(matchesView(task, "date:2026-11-07", "2026-11-05"), false);
  assert.equal(matchesView({ ...task, completedAt: "2026-11-06T12:00:00Z" }, "date:2026-11-06"), false);
});
