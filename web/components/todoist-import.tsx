"use client";

import { useRef, useState } from "react";
import { readTodoistProject } from "@/lib/todoist-import";
import { usePlanner } from "./planner-context";

export function TodoistImportSettings() {
  const { data, saveBatch } = usePlanner();
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof readTodoistProject>> | null>(null);
  const [message, setMessage] = useState("");
  const request = useRef(0);

  async function read(file: File) {
    const current = ++request.current;
    setPreview(null);
    setMessage("Reading CSV…");
    try {
      const imported = await readTodoistProject(await file.text(), file.name);
      if (request.current !== current) return;
      setPreview(imported);
      setMessage("");
    } catch (error) {
      if (request.current === current) setMessage(error instanceof Error ? error.message : "Could not read the CSV.");
    }
  }

  const alreadyImported = preview && data.lists.some((list) => list.id === preview.list.id);
  return (
    <section>
      <h2>Import a Todoist project</h2>
      <p className="hint">Preview a project CSV before importing it. Slate maps sections, task names, descriptions, priorities, and supported dates. Indented tasks become regular tasks. Unmapped schedules are preserved in notes.</p>
      <input aria-label="Todoist project CSV" type="file" accept=".csv,text/csv" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void read(file);
        event.target.value = "";
      }} />
      {preview && (
        <div className="import-preview">
          <h3>{preview.list.name}</h3>
          <p>{preview.tasks.length} tasks · {preview.list.sections.length} sections</p>
          {preview.flattened > 0 && <p>{preview.flattened} nested tasks will become regular tasks.</p>}
          {preview.unmappedDates > 0 && <p>{preview.unmappedDates} tasks have schedule details saved in notes.</p>}
          {preview.skipped > 0 && <p>{preview.skipped} unsupported rows will be skipped.</p>}
          {alreadyImported ? <p>This exact file has already been imported.</p> : (
            <button className="primary" type="button" onClick={() => {
              saveBatch([
                { kind: "lists", record: preview.list },
                ...preview.tasks.map((record) => ({ kind: "tasks" as const, record })),
              ]);
              setMessage(`Imported ${preview.tasks.length} tasks into ${preview.list.name}.`);
              setPreview(null);
            }}>Import project</button>
          )}
          <button className="text-button" type="button" onClick={() => setPreview(null)}>Close preview</button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
