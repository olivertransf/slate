import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeRecords } from "./records.ts";

describe("sanitizeRecords", () => {
  it("accepts a versioned task and drops a malformed one", () => {
    const result = sanitizeRecords({
      tasks: [
        {
          id: "task-1",
          title: "Walk",
          notes: "",
          listId: null,
          sectionId: null,
          priority: 1,
          tagIds: [],
          dueOn: "2026-10-16",
          dueTime: null,
          startOn: null,
          repeat: { every: 1, unit: "week", weekdays: [1, 3] },
          remindMinutesBefore: 15,
          completedAt: null,
          subtasks: [{ id: "sub-1", title: "Shoes", done: false }],
          sort: 1,
          updatedAt: "2026-10-15T12:00:00.000Z",
          deletedAt: null,
        },
        { id: "bad" },
      ],
    });
    assert.equal(result.rejected, 1);
    assert.equal(result.records.tasks?.length, 1);
    assert.equal(result.records.tasks?.[0]?.repeat?.weekdays?.[0], 1);
  });

  it("fills optional archive and reminder fields that older clients omit", () => {
    const result = sanitizeRecords({
      lists: [{
        id: "list-1",
        name: "Personal",
        color: "#4772FA",
        sort: 1,
        sections: [],
        updatedAt: "2026-10-15T12:00:00.000Z",
        deletedAt: null,
      }],
      habits: [{
        id: "habit-1",
        name: "Journaling",
        color: "#4E81FB",
        cadence: "daily",
        goal: 1,
        sort: 1,
        updatedAt: "2026-10-15T12:00:00.000Z",
        deletedAt: null,
      }],
    });
    assert.equal(result.rejected, 0);
    assert.equal(result.records.lists?.[0]?.archivedAt, null);
    assert.equal(result.records.habits?.[0]?.reminderTime, null);
  });
});
