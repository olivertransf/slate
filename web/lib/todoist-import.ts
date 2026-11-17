import { LIST_COLORS, type ListRecord, type TaskRecord } from "./model.ts";

function readCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && !field) quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      rows.push([...row, field]);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("The CSV has an unclosed quoted field.");
  if (row.length || field) rows.push([...row, field]);
  return rows;
}

function isoDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export async function readTodoistProject(source: string, filename: string) {
  const [header, ...rows] = readCsv(source.replace(/^\uFEFF/, ""));
  const names = new Map((header ?? []).map((name, index) => [name.trim().toUpperCase(), index]));
  if (!names.has("TYPE") || !names.has("CONTENT")) throw new Error("Choose a Todoist project CSV with TYPE and CONTENT columns.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const key = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
  const updatedAt = new Date().toISOString();
  const list: ListRecord = {
    id: `todoist-${key}`, name: filename.replace(/\.csv$/i, "").slice(0, 200) || "Todoist import",
    color: LIST_COLORS[0], sort: Date.now(), sections: [], updatedAt, deletedAt: null,
  };
  const tasks: TaskRecord[] = [];
  let current: TaskRecord | null = null;
  let sectionId: string | null = null;
  let flattened = 0;
  let unmappedDates = 0;
  let skipped = 0;
  rows.forEach((row, index) => {
    const get = (name: string) => row[names.get(name) ?? -1]?.trim() ?? "";
    const type = get("TYPE").toLowerCase();
    const title = get("CONTENT");
    const description = get("DESCRIPTION");
    const id = `${list.id}-${index}`;
    if (type === "meta" && description) {
      list.description = description.slice(0, 2000);
      return;
    }
    if (!type && !title) return;
    if (type === "section" && title) {
      sectionId = id;
      list.sections.push({ id, name: title.slice(0, 200), sort: index });
      current = null;
      return;
    }
    if (type === "note" && current && title) {
      current.notes = [current.notes, title].filter(Boolean).join("\n\n").slice(0, 20000);
      return;
    }
    if (type !== "task" || !title) {
      skipped += 1;
      return;
    }
    if (Number(get("INDENT")) > 1) flattened += 1;
    const scheduled = get("DATE_TIME") || get("DATE");
    const deadline = get("DEADLINE");
    const plannedDay = isoDay(scheduled.split(/[T ]/)[0]);
    const dueOn = isoDay(deadline);
    const localTime = /^\d{4}-\d{2}-\d{2}[T ]((?:[01]\d|2[0-3]):[0-5]\d)(?::\d\d)?$/.exec(scheduled)?.[1] ?? null;
    const unmapped = [
      scheduled && (!plannedDay || (scheduled.length > 10 && !localTime) || /^every\b/i.test(get("DATE"))) ? `Todoist schedule: ${get("DATE") || scheduled}` : "",
      deadline && !dueOn ? `Todoist deadline: ${deadline}` : "",
    ].filter(Boolean);
    if (unmapped.length) unmappedDates += 1;
    const priority = Number(get("PRIORITY"));
    current = {
      id, title: title.slice(0, 500), notes: [description, ...unmapped].filter(Boolean).join("\n\n").slice(0, 20000),
      listId: list.id, sectionId, priority: priority >= 1 && priority <= 4 && Number.isInteger(priority) ? (4 - priority) as TaskRecord["priority"] : 0,
      tagIds: [], dueOn, dueTime: null, startOn: plannedDay, startTime: localTime,
      repeat: null, remindMinutesBefore: null, completedAt: null, subtasks: [], sort: index, updatedAt, deletedAt: null,
    };
    tasks.push(current);
  });
  if (!tasks.length) throw new Error("This CSV contains no importable tasks.");
  return { list, tasks, flattened, unmappedDates, skipped };
}
