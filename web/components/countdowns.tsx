"use client";

import { useState, type FormEvent } from "react";
import { alive, countdownAmount, countdownDay, parseDay, visibleLists, type CountdownRecord } from "@/lib/model";
import { AddSheet } from "./add-sheet";
import { newId, today, usePlanner } from "./planner-context";

const UNITS = ["day", "week", "month", "year"] as const;
const COLORS = ["#4E81FB", "#22A06B", "#E5484D", "#F5A524", "#8C5EFA", "#12A594"];

export function CountdownView({ addOpen = false, onAddClose, onProject }: { addOpen?: boolean; onAddClose?: () => void; onProject: (id: string) => void }) {
  const { data, save } = usePlanner();
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const day = today();
  const items = alive(data.countdowns).sort((a, b) => Number(!!a.completed) - Number(!!b.completed) || Number(!!b.pinned) - Number(!!a.pinned) || countdownDay(a, day).localeCompare(countdownDay(b, day)) || a.sort - b.sort || a.title.localeCompare(b.title));
  const current = items.find((item) => item.id === selected) ?? null;

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    if (!name) return;
    const record: CountdownRecord = {
      id: newId(),
      title: name,
      day: today(),
      mode: "countdown",
      repeatYearly: false,
      unit: "day",
      color: COLORS[items.length % COLORS.length] ?? COLORS[0],
      imageKey: null,
      sort: Date.now(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    save("countdowns", record);
    setSelected(record.id);
    setTitle("");
    onAddClose?.();
  }

  function remove(record: CountdownRecord) {
    save("countdowns", { ...record, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    if (selected === record.id) setSelected(null);
  }

  return (
    <section className="stage flow">
      <header>
        <h1>Countdowns</h1>
      </header>
      <div className="flow-body">
        {addOpen && (
          <AddSheet label="New countdown" onClose={() => onAddClose?.()} onSubmit={add}>
            <input name="title" aria-label="Countdown title" placeholder="Countdown title" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
            <div className="sheet-tools"><button className="primary" type="submit" disabled={!title.trim()}>Add countdown</button></div>
          </AddSheet>
        )}
        {items.length === 0 && <p className="hint">Tap + and name a countdown. Set the date on the card.</p>}
        <div className={current ? "split" : ""}>
          <div className="count-list">
            {items.map((item) => {
              const amount = countdownAmount(item, day);
              return (
                <button key={item.id} type="button" className={item.id === selected ? "count-row selected" : "count-row"} onClick={() => setSelected(item.id === selected ? null : item.id)}>
                  {item.imageKey ? <img className="count-icon" alt="" src={`/api/files?key=${encodeURIComponent(item.imageKey)}`} /> : <i className="count-icon" style={{ background: item.color }}>{item.title.slice(0, 1)}</i>}
                  <span className="count-name">{item.pinned && "☆ "}{item.title}</span>
                  <span className="count-figure">
                    <strong>{item.completed ? "✓" : amount}</strong>
                    <em>{item.completed ? "Completed" : phrase(item, amount)}</em>
                  </span>
                </button>
              );
            })}
          </div>
          {current && <CountdownEditor record={current} onProject={onProject} onDelete={() => remove(current)} />}
        </div>
      </div>
    </section>
  );
}

function phrase(record: CountdownRecord, amount: number): string {
  const name = record.unit === "day" ? "Day" : `${record.unit[0]?.toUpperCase() ?? ""}${record.unit.slice(1)}`;
  const unit = Math.abs(amount) === 1 ? name : `${name}s`;
  if (amount === 0) return record.mode === "countup" ? "Started" : "Today";
  if (record.mode === "countup") return `${unit} since`;
  return `${unit} Left`;
}

function formatWhen(day: string): string {
  return parseDay(day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function CountdownEditor({ record, onDelete, onProject }: { record: CountdownRecord; onDelete: () => void; onProject: (id: string) => void }) {
  const { data, save } = usePlanner();
  const projects = visibleLists(data.lists);
  const linkedProject = projects.find((list) => list.id === record.projectId);
  function patch(partial: Partial<CountdownRecord>) {
    save("countdowns", { ...record, ...partial, updatedAt: new Date().toISOString() });
  }
  return (
    <div className="editor-card">
      <label>Title
        <input type="text" aria-label="Title" value={record.title} onChange={(event) => patch({ title: event.target.value })} />
      </label>
      <label>Project
        <select value={record.projectId ?? ""} onChange={(event) => patch({ projectId: event.target.value || null })}>
          <option value="">No project</option>
          {record.projectId && !linkedProject && <option value={record.projectId}>Unavailable project</option>}
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>
      {linkedProject && <button type="button" className="text-button" onClick={() => onProject(linkedProject.id)}>Open project</button>}
      <label><input type="checkbox" checked={record.pinned ?? false} onChange={(event) => patch({ pinned: event.target.checked })} /> Pin countdown</label>
      <label><input type="checkbox" checked={record.showOnCalendar !== false} onChange={(event) => patch({ showOnCalendar: event.target.checked })} /> Show on calendar</label>
      <label><input type="checkbox" checked={record.completed ?? false} onChange={(event) => patch({ completed: event.target.checked })} /> Milestone completed</label>
      <label>Date
        <input type="date" aria-label="Date" value={record.day} onChange={(event) => patch({ day: event.target.value })} />
      </label>
      <div className="seg">
        <button type="button" className={record.mode === "countdown" ? "on" : ""} onClick={() => patch({ mode: "countdown" })}>Countdown</button>
        <button type="button" className={record.mode === "countup" ? "on" : ""} onClick={() => patch({ mode: "countup" })}>Count up</button>
      </div>
      <div className="chips">
        {UNITS.map((unit) => (
          <button key={unit} type="button" className={record.unit === unit ? "chip on" : "chip"} onClick={() => patch({ unit })}>{unit}</button>
        ))}
      </div>
      <label>Remind days before
        <input type="number" min={0} aria-label="Reminder days" value={record.remindDaysBefore ?? ""} onChange={(event) => patch({ remindDaysBefore: event.target.value === "" ? null : Number(event.target.value) })} />
      </label>
      <div className="seg">
        <button type="button" onClick={() => patch({ sort: record.sort - 1 })}>Move earlier</button>
        <button type="button" onClick={() => patch({ sort: record.sort + 1 })}>Move later</button>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={record.repeatYearly} onChange={(event) => patch({ repeatYearly: event.target.checked })} />
        Repeat every year
      </label>
      <div className="swatch-row">
        {COLORS.map((color) => (
          <button key={color} type="button" className={record.color === color ? "on" : ""} style={{ background: color }} aria-label={`Color ${color}`} onClick={() => patch({ color })} />
        ))}
      </div>
      <label>Image
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const body = new FormData();
            body.set("file", file);
            void fetch("/api/files", { method: "POST", body }).then(async (response) => {
              if (!response.ok) return;
              const payload = (await response.json()) as { key: string };
              if (record.imageKey) void fetch(`/api/files?key=${encodeURIComponent(record.imageKey)}`, { method: "DELETE" });
              patch({ imageKey: payload.key });
            });
          }}
        />
      </label>
      <button type="button" className="danger" onClick={onDelete}>Delete countdown</button>
    </div>
  );
}
