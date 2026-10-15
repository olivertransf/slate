"use client";

import { useState, type FormEvent } from "react";
import { alive, countdownAmount, parseDay, type CountdownRecord } from "@/lib/model";
import { newId, today, usePlanner } from "./planner-context";

const UNITS = ["day", "week", "month", "year"] as const;
const COLORS = ["#4E81FB", "#22A06B", "#E5484D", "#F5A524", "#8C5EFA", "#12A594"];

export function CountdownView({ addOpen = false, onAddClose }: { addOpen?: boolean; onAddClose?: () => void }) {
  const { data, save } = usePlanner();
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const items = alive(data.countdowns).sort((a, b) => a.sort - b.sort);
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
          <form className="add-sheet" onSubmit={add}>
            <button type="button" className="sheet-backdrop" aria-label="Close" onClick={onAddClose} />
            <div className="sheet-card" role="dialog" aria-modal="true" aria-label="New countdown">
              <input name="title" aria-label="Countdown title" placeholder="New countdown" value={title} autoFocus onChange={(event) => setTitle(event.target.value)} />
              <div className="sheet-tools"><button className="primary" type="submit">Add</button></div>
            </div>
          </form>
        )}
        {items.length === 0 && <p className="hint">Tap + and name a countdown. Set the date on the card.</p>}
        <div className={current ? "split" : ""}>
          <div className="count-list">
            {items.map((item) => {
              const amount = countdownAmount(item, today());
              return (
                <button key={item.id} type="button" className={item.id === selected ? "count-row selected" : "count-row"} onClick={() => setSelected(item.id === selected ? null : item.id)}>
                  {item.imageKey ? <img className="count-icon" alt="" src={`/api/files?key=${encodeURIComponent(item.imageKey)}`} /> : <i className="count-icon" style={{ background: item.color }}>{item.title.slice(0, 1)}</i>}
                  <span className="count-name">{item.title}</span>
                  <span className="count-figure">
                    <strong>{amount}</strong>
                    <em>{phrase(item, amount)}</em>
                  </span>
                </button>
              );
            })}
          </div>
          {current && <CountdownEditor record={current} onDelete={() => remove(current)} />}
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

function CountdownEditor({ record, onDelete }: { record: CountdownRecord; onDelete: () => void }) {
  const { save } = usePlanner();
  function patch(partial: Partial<CountdownRecord>) {
    save("countdowns", { ...record, ...partial, updatedAt: new Date().toISOString() });
  }
  return (
    <div className="editor-card">
      <label>Title
        <input type="text" aria-label="Title" value={record.title} onChange={(event) => patch({ title: event.target.value })} />
      </label>
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
