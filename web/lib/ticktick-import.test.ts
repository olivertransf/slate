import assert from "node:assert/strict";
import { test } from "node:test";
import { emptySnapshot } from "./model.ts";
import { importTickTick, tickDate, tickRepeat, type TickTickExport } from "./ticktick-import.ts";
import { sanitizeRecords } from "./records.ts";

const source = (): TickTickExport => ({
  exportedAt: "2026-11-07T20:00:00.000Z", projects: [{ id: "a", name: "🏠Reminders", color: "#123456", columns: [{ id: "s", name: "Work" }], tasks: [{ id: "t", projectId: "a", title: "Plan", kind: "NOTE", content: "A".repeat(20638), columnId: "s", dueDate: "2026-11-08T01:30:00+0000", timeZone: "America/Los_Angeles", priority: 5, tags: ["work"], items: [{ id: "i", title: "First", status: 1 }] }] }],
  completed: [{ id: "c", projectId: "a", title: "Done", status: 2, completedTime: "2025-01-01T10:00:00-0800" }], tags: [], groups: [], habits: [{ id: "h", name: "Practice", repeatRule: "RRULE:FREQ=DAILY;INTERVAL=1" }], habitChecks: [{ habitId: "h", checkins: [{ stamp: 20261106, status: 2, value: 1 }] }], countdowns: [{ id: "d", name: "Birthday", date: 20090221, repeatFlag: "RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=21" }],
});

test("TickTick import preserves long notes, types, checklist state, sections, tags, completed history and local dates", () => {
  const existing = emptySnapshot();
  existing.lists.push({ id: "existing", name: "🏠 Reminders", color: "#000000", sort: 1, sections: [], updatedAt: source().exportedAt, deletedAt: null });
  const result = importTickTick(source(), existing);
  const task = result.records.tasks[0];
  assert.equal(task.listId, "existing");
  assert.equal(task.kind, "note");
  assert.equal(task.notes.length, 20638);
  assert.equal(task.dueOn, "2026-11-07");
  assert.equal(task.dueTime, "17:30");
  assert.equal(task.priority, 3);
  assert.equal(task.subtasks[0].done, true);
  assert.equal(task.sectionId, result.records.lists[0].sections[0].id);
  assert.equal(task.tagIds[0], result.records.tags[0].id);
  assert.equal(result.records.tasks[1].completedAt, "2025-01-01T18:00:00.000Z");
  assert.equal(result.records.habitChecks[0].count, 1);
  assert.equal(result.records.countdowns[0].repeatYearly, true);
  assert.equal(sanitizeRecords(result.records).rejected, 0);
});

test("repeating an import skips previously imported records and preserves subsequent Slate edits", () => {
  const first = importTickTick(source(), emptySnapshot()).records;
  first.tasks[0].title = "Edited in Slate";
  const next = importTickTick(source(), first).records;
  for (const kind of ["lists", "tasks", "tags", "habits", "habitChecks", "countdowns"] as const) assert.equal(next[kind].length, 0, kind);
  assert.equal(first.tasks[0].title, "Edited in Slate");
});

test("unknown historical lists stay archived and unsupported recurrence is retained without inventing a schedule", () => {
  const data = source();
  data.completed[0].projectId = "missing";
  data.projects[0].tasks![0].repeatFlag = "RRULE:FREQ=MONTHLY;BYDAY=2MO";
  const { records, warnings } = importTickTick(data, emptySnapshot());
  assert.equal(records.lists.find((list) => list.id === "ticktick-list-missing")?.archivedAt, data.exportedAt);
  assert.equal(records.tasks[0].repeat, null);
  assert.match(records.tasks[0].notes, /BYDAY=2MO/);
  assert.equal(warnings.length, 1);
});

test("all-day and floating dates retain their calendar day; supported weekday repeats remain exact", () => {
  assert.deepEqual(tickDate("2026-11-08T00:00:00+0000", true), { day: "2026-11-08", time: null });
  assert.deepEqual(tickDate("2026-11-08T09:30:00+0000", false, true), { day: "2026-11-08", time: "09:30" });
  assert.deepEqual(tickRepeat("RRULE:FREQ=WEEKLY;BYDAY=MO,WE;INTERVAL=2"), { unit: "week", every: 2, weekdays: [1, 3] });
});
