"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { addDays, alive, habitCheckId, habitScheduled, monthGrid, parseDay, startOfWeek, type HabitRecord } from "@/lib/model";
import { AddSheet } from "./add-sheet";
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

  function log(habit: HabitRecord, count: number) {
    save("habitChecks", {
      id: habitCheckId(habit.id, day),
      habitId: habit.id,
      day,
      count,
      updatedAt: new Date().toISOString(),
    });
  }

  function toggle(habit: HabitRecord) {
    const existing = checkFor(data.habitChecks, habit.id, day)?.count ?? 0;
    const next = progress(habit) >= habit.goal ? 0 : existing + 1;
    log(habit, next);
  }

  const scheduled = habits.filter((habit) => habitScheduled(habit, day));
  const offDay = habits.filter((habit) => !habitScheduled(habit, day));
  const waiting = scheduled.filter((habit) => progress(habit) < habit.goal);
  const checked = scheduled.filter((habit) => progress(habit) >= habit.goal);

  return (
    <section className="stage flow">
      <header>
        <h1>Habits</h1>
      </header>
      <div className="flow-body">
        <DateStrip day={day} onDay={setDay} />
        {addOpen && (
          <AddSheet label="New habit" onClose={() => onAddClose?.()} onSubmit={addHabit}>
            <input name="habit" aria-label="Habit name" placeholder="Habit name" maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
            <div className="sheet-tools"><button className="primary" type="submit" disabled={!name.trim()}>Add habit</button></div>
          </AddSheet>
        )}
        {habits.length === 0 && <p className="hint">Tap + and name a habit.</p>}
        <div className={current ? "split" : ""}>
          <div className="cards">
            {waiting.map((habit) => (
              <div key={habit.id} className={habit.id === selected ? "habit-row on" : "habit-row"} onClick={() => setSelected(habit.id === selected ? null : habit.id)}>
                <button type="button" className="habit-mark" style={{ color: habit.color }} aria-label={`Check in ${habit.name}`} onClick={(event) => { event.stopPropagation(); toggle(habit); }}>
                  <i style={{ borderColor: habit.color }} />
                </button>
                <button type="button" className="text-button" onClick={(event) => { event.stopPropagation(); setSelected(habit.id); }}>{habit.name}</button>
                <span className="habit-streak">{streak(data.habitChecks, habit, day)}</span>
              </div>
            ))}
          </div>
          <h2>Checked-in</h2>
          <div className="cards">
            {checked.map((habit) => (
              <div key={habit.id} className="habit-row">
                <button type="button" aria-label={`Clear ${habit.name} check-in`} className="habit-mark done" style={{ background: habit.color }} onClick={() => log(habit, 0)} />
                <button type="button" className="text-button" onClick={() => setSelected(habit.id)}>{habit.name}</button>
                <span className="habit-streak">{streak(data.habitChecks, habit, day)}</span>
              </div>
            ))}
          </div>
          {offDay.length > 0 && (
            <section>
              <h2>Not scheduled</h2>
              {offDay.map((habit) => <button key={habit.id} type="button" className="text-button" onClick={() => setSelected(habit.id)}>{habit.name}</button>)}
            </section>
          )}
          {current && (
            <aside className="side-editor">
              <HabitEditor habit={current} onClose={() => setSelected(null)} />
              <form key={`${current.id}:${day}`} className="task-search-controls" onSubmit={(event) => {
                event.preventDefault();
                const amount = Number(new FormData(event.currentTarget).get("amount"));
                if (Number.isInteger(amount) && amount >= 0 && amount <= 100) log(current, amount);
              }}>
                <label>Check-in for {day}
                  <input type="number" name="amount" min={0} max={100} required defaultValue={checkFor(data.habitChecks, current.id, day)?.count ?? 0} />
                </label>
                <button className="text-button">Save check-in</button>
              </form>
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
      <div className="weekday-picks" role="group" aria-label="Scheduled weekdays">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, day) => {
          const selected = habit.weekdays?.length ? habit.weekdays : [0, 1, 2, 3, 4, 5, 6];
          return <button key={label} type="button" aria-pressed={selected.includes(day)} className={selected.includes(day) ? "on" : ""} onClick={() => {
            const weekdays = selected.includes(day) ? selected.filter((value) => value !== day) : [...selected, day];
            if (weekdays.length) patch({ weekdays });
          }}>{label}</button>;
        })}
      </div>
      <label>Unit
        <input maxLength={32} placeholder="e.g. minutes" value={habit.goalUnit ?? ""} onChange={(event) => patch({ goalUnit: event.target.value })} />
      </label>
      <label>Goal
        <input type="number" min={1} max={100} aria-label="Goal" value={habit.goal} onChange={(event) => patch({ goal: Math.min(100, Math.max(1, Math.round(Number(event.target.value)) || 1)) })} />
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
  const weekly = habit.cadence === "weekly";
  const counts = new Map<string, number>();
  for (const check of checks) {
    if (check.habitId !== habit.id || check.day > day) continue;
    const key = weekly ? startOfWeek(check.day) : check.day;
    counts.set(key, (counts.get(key) ?? 0) + check.count);
  }
  let cursor = weekly ? startOfWeek(day) : day;
  const step = weekly ? 7 : 1;
  if ((counts.get(cursor) ?? 0) < habit.goal && day === today()) cursor = addDays(cursor, -step);
  for (let index = 0; index < 365; index += 1, cursor = addDays(cursor, -step)) {
    if (!weekly && !habitScheduled(habit, cursor)) continue;
    if ((counts.get(cursor) ?? 0) < habit.goal) break;
    total += 1;
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
