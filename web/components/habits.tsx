"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { addDays, alive, habitCheckId, monthGrid, parseDay, startOfWeek, type HabitRecord } from "@/lib/model";
import { checkFor, newId, today, usePlanner } from "./planner-context";

const COLORS = ["#4E81FB", "#22A06B", "#E5484D", "#F5A524", "#8C5EFA", "#12A594"];

export function HabitView({ addOpen = false, onAddClose }: { addOpen?: boolean; onAddClose?: () => void }) {
  const { data, save } = usePlanner();
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [day, setDay] = useState(today());
  const habits = alive(data.habits).filter((habit) => !habit.archivedAt).sort((a, b) => a.sort - b.sort);
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
    onAddClose?.();
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

  const waiting = habits.filter((habit) => progress(habit) < habit.goal);
  const checked = habits.filter((habit) => progress(habit) >= habit.goal);

  return (
    <section className="stage flow">
      <header>
        <h1>Habits</h1>
      </header>
      <div className="flow-body">
        <DateStrip day={day} onDay={setDay} />
        {addOpen && (
          <form className="add-sheet" onSubmit={addHabit}>
            <button type="button" className="sheet-backdrop" aria-label="Close" onClick={onAddClose} />
            <div className="sheet-card" role="dialog" aria-modal="true" aria-label="New habit">
              <input name="habit" aria-label="Habit name" placeholder="New habit" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
              <div className="sheet-tools"><button className="primary" type="submit">Add</button></div>
            </div>
          </form>
        )}
        {habits.length === 0 && <p className="hint">Tap + and name a habit.</p>}
        <div className={current ? "split" : ""}>
          <div className="cards">
            {waiting.map((habit) => (
              <div key={habit.id} className={habit.id === selected ? "habit-row on" : "habit-row"} onClick={() => setSelected(habit.id === selected ? null : habit.id)}>
                <button type="button" className="habit-mark" style={{ color: habit.color }} aria-label={`Check in ${habit.name}`} onClick={(event) => { event.stopPropagation(); toggle(habit); }}>
                  <i style={{ borderColor: habit.color }} />
                </button>
                <strong>{habit.name}</strong>
                <span className="habit-streak">{streak(data.habitChecks, habit, day)}</span>
              </div>
            ))}
          </div>
          <h2>Checked-in</h2>
          <div className="cards">
            {checked.map((habit) => (
              <button key={habit.id} type="button" className="habit-row" onClick={() => toggle(habit)}>
                <i className="habit-mark done" style={{ background: habit.color }} />
                <strong>{habit.name}</strong>
                <span className="habit-streak">{streak(data.habitChecks, habit, day)}</span>
              </button>
            ))}
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
      <label>Reminder
        <input type="time" aria-label="Habit reminder" value={habit.reminderTime ?? ""} onChange={(event) => patch({ reminderTime: event.target.value || null })} />
      </label>
      <button type="button" onClick={() => patch({ archivedAt: habit.archivedAt ? null : new Date().toISOString() })}>{habit.archivedAt ? "Unarchive" : "Archive"}</button>
      <button type="button" className="danger" onClick={() => { patch({ deletedAt: new Date().toISOString() }); onClose(); }}>Delete habit</button>
    </div>
  );
}

function DateStrip({ day, onDay }: { day: string; onDay: (day: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const weeks = useMemo(() => Array.from({ length: 27 }, (_, index) => addDays(startOfWeek(today()), (index - 20) * 7)), []);
  useEffect(() => {
    scroller.current?.querySelector<HTMLElement>(`[data-week="${startOfWeek(day)}"]`)?.scrollIntoView({ inline: "start", block: "nearest" });
  }, [day]);
  return (
    <div className="date-strip" ref={scroller}>
      {weeks.map((start) => (
        <div key={start} className="date-week" data-week={start}>
          {Array.from({ length: 7 }, (_, index) => addDays(start, index)).map((item) => {
            const date = parseDay(item);
            return (
              <button key={item} type="button" className={item === day ? "on" : ""} onClick={() => onDay(item)}>
                <span>{date.toLocaleDateString(undefined, { weekday: "narrow" })}</span>
                <strong>{date.getDate()}</strong>
              </button>
            );
          })}
        </div>
      ))}
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
