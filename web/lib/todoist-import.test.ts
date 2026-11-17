import assert from "node:assert/strict";
import { it } from "node:test";
import { readTodoistProject } from "./todoist-import.ts";

it("maps Todoist project CSV and produces stable IDs on retry", async () => {
  const csv = "TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,DATE,DEADLINE\r\n"
    + "section,Practice,,,,,\r\n"
    + 'task,"Bach, Suite 1","First line\nSecond line",1,2,2026-11-06T13:30:00,2026-11-10\r\n'
    + "note,Bring the score,,,,,\r\n"
    + "task,Scales,,,1,every week,\r\n";
  const result = await readTodoistProject(csv, "Music.csv");
  const retry = await readTodoistProject(csv, "Music again.csv");
  assert.equal(result.list.id, retry.list.id);
  assert.equal(result.tasks[0].title, "Bach, Suite 1");
  assert.equal(result.tasks[0].sectionId, result.list.sections[0].id);
  assert.equal(result.tasks[0].priority, 3);
  assert.equal(result.tasks[0].startTime, "13:30");
  assert.equal(result.tasks[0].dueOn, "2026-11-10");
  assert.match(result.tasks[0].notes, /Second line\n\nBring the score/);
  assert.match(result.tasks[1].notes, /every week/);
  assert.equal(result.flattened, 1);
  assert.equal(result.unmappedDates, 1);
});
