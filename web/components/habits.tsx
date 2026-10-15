"use client";

import { useState, type FormEvent } from "react";
import { addDays, alive, habitCheckId, monthGrid, parseDay, startOfWeek, type HabitRecord } from "@/lib/model";
import { checkFor, newId, today, usePlanner } from "./planner-context";

const COLORS = ["#4E81FB", "#22A06B", "#E5484D", "#F5A524", "#8C5EFA", "#12A594"];

export function HabitView() {
  const { data, save } = usePlanner();
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const habits = alive(data.habits).sort((a, b) => a.sort - b.sort);
  const day = today();
  const current = habits.find((habit) => habit.id === selected) ?? null;

  function addHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("habit") ?? "").trim();
    if (!title) return;
    const habit: HabitRecord = {
      id: newId(),
      name: title,
      color: COLORS[habits.length % COLORS.length] ?? COLORS[0],
      cadence: "daily",
      goal: 1,
      sort: Date.now(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    save("habits", habit);
    setName("");
  }

  function progress(habit: HabitRecord): number {
    if (habit.cadence === "weekly") {
      const start = startOfWeek(day);
      return data.habitChecks
        .filter((check) => check.habitId === habit.id && check.day >= start && check.day <= addDays(start, 6))
        .reduce((total, check) => total + check.count, 0);
    }
    return checkFor(data.habitChecks, habit.id, day)?.count ?? 0;
  }

  function toggle(habit: HabitRecord) {
    const existing = checkFor(data.habitChecks, habit.id, day)?.count ?? 0;
    const next = progress(habit) >= habit.goal ? 0 : existing + 1;
    save("habitChecks", {
      id: habitCheckId(habit.id, day),
      habitId: habit.id,
      day,
      count: next,
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <section className="stage flow">
      <header>
        <h1>Habits</h1>
      </header>
      <div className="flow-body">
        <form className="add-row" onSubmit={addHabit}>
          <input name="habit" aria-label="Habit name" placeholder="New habit" value={name} onChange={(event) => setName(event.target.value)} />
          <button className="primary" type="submit">Add</button>
        </form>
        {habits.length === 0 && <p className="hint">Name a habit and press Enter.</p>}
        <div className={current ? "split" : ""}>
          <div className="cards">
            {habits.map((habit) => {
              const count = progress(habit);
              const percent = Math.min(100, Math.round((count / Math.max(1, habit.goal)) * 100));
              return (
                <div key={habit.id} className={habit.id === selected ? "habit-card on" : "habit-card"} style={{ ["--habit" as string]: habit.color }} onClick={() => setSelected(habit.id === selected ? null : habit.id)}>
                  <button
                    type="button"
                    className="ring"
                    style={{ ["--p" as string]: percent, ["--habit" as string]: habit.color }}
                    aria-label={`Check in ${habit.name}`}
                    onClick={(event) => { event.stopPropagation(); toggle(habit); }}
                  >
                    <span>{count}/{habit.goal}</span>
                  </button>
                  <div className="card-copy">
                    <strong>{habit.name}</strong>
                    <div className="habit-meta">{habit.cadence === "weekly" ? "Weekly" : "Daily"} · {streak(data.habitChecks, habit, day)} day streak</div>
                    <div className="week-dots" style={{ ["--habit" as string]: habit.color }}>
                      {Array.from({ length: 7 }, (_, index) => addDays(day, index - 6)).map((item) => {
                        const hit = (data.habitChecks.find((check) => check.habitId === habit.id && check.day === item)?.count ?? 0) >= habit.goal;
                        return <i key={item} className={hit ? "on" : ""} />;
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {current && (
            <aside className="side-editor">
              <HabitEditor habit={current} onClose={() => setSelected(null)} />
              <Heatmap habit={current} checks={data.habitChecks} />
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}

function HabitEditor({ habit, onClose }: { habit: HabitRecord; onClose: () => void }) {
  const { save } = usePlanner();
  function patch(partial: Partial<HabitRecord>) {
    save("habits", { ...habit, ...partial, updatedAt: new Date().toISOString() });
  }
  return (
    <div className="editor-card">
      <label>Name
        <input type="text" aria-label="Habit name" value={habit.name} onChange={(event) => patch({ name: event.target.value })} />
      </label>
      <div className="swatch-row">
        {COLORS.map((color) => (
          <button key={color} type="button" className={habit.color === color ? "on" : ""} style={{ background: color }} aria-label={`Color ${color}`} onClick={() => patch({ color })} />
        ))}
      </div>
      <div className="seg">
        <button type="button" className={habit.cadence === "daily" ? "on" : ""} onClick={() => patch({ cadence: "daily" })}>Daily</button>
        <button type="button" className={habit.cadence === "weekly" ? "on" : ""} onClick={() => patch({ cadence: "weekly" })}>Weekly</button>
      </div>
      <label>Goal
        <input type="number" min={1} aria-label="Goal" value={habit.goal} onChange={(event) => patch({ goal: Math.max(1, Number(event.target.value) || 1) })} />
      </label>
      <button type="button" className="danger" onClick={() => { patch({ deletedAt: new Date().toISOString() }); onClose(); }}>Delete habit</button>
    </div>
  );
}

function streak(checks: { habitId: string; day: string; count: number }[], habit: HabitRecord, day: string): number {
  let total = 0;
  let cursor = day;
  for (let index = 0; index < 365; index += 1) {
    const count = checks.find((check) => check.habitId === habit.id && check.day === cursor)?.count ?? 0;
    if (count < habit.goal) break;
    total += 1;
    cursor = addDays(cursor, -1);
  }
  return total;
}

function Heatmap({ habit, checks }: { habit: HabitRecord; checks: { habitId: string; day: string; count: number }[] }) {
  const cells = monthGrid(today());
  const month = parseDay(today()).getMonth();
  return (
    <div className="heat-card">
      <div className="section-title">This month</div>
      <div className="heat">
        {cells.map((day) => {
          const count = checks.find((check) => check.habitId === habit.id && check.day === day)?.count ?? 0;
          const outside = parseDay(day).getMonth() !== month;
          return <i key={day} style={{ opacity: outside ? 0.25 : 1, background: count > 0 ? habit.color : "var(--line)" }} />;
        })}
      </div>
    </div>
  );
}
