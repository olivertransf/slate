"use client";

import { useEffect, useState } from "react";
import { dayISO, taskOpen, visibleLists } from "@/lib/model";
import { usePlanner } from "./planner-context";

type Timer = {
  taskId: string;
  title: string;
  target: number | null;
  accumulated: number;
  startedAt: number | null;
};
type Session = { id: string; title: string; duration: number; finishedAt: number };
type FocusState = { timer: Timer | null; history: Session[] };
const KEY = "slate-focus";
const EMPTY: FocusState = { timer: null, history: [] };
const MODES = [["pomodoro", "Pomodoro"], ["stopwatch", "Stopwatch"]] as const;

function elapsed(timer: Timer, now: number) {
  return timer.accumulated + (timer.startedAt === null ? 0 : Math.max(0, now - timer.startedAt));
}

function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return [Math.floor(seconds / 60), seconds % 60].map((part) => String(part).padStart(2, "0")).join(":");
}

export function FocusView() {
  const { data } = usePlanner();
  const [state, setState] = useState<FocusState | null>(null);
  const [taskId, setTaskId] = useState("");
  const [mode, setMode] = useState<(typeof MODES)[number][0]>("pomodoro");
  const [minutes, setMinutes] = useState(25);
  const [now, setNow] = useState(0);
  const timer = state?.timer;
  const spent = timer ? elapsed(timer, now) : 0;
  const done = timer?.target != null && spent >= timer.target;
  const running = timer?.startedAt != null && !done;
  const activeLists = new Set(visibleLists(data.lists).map((list) => list.id));
  const tasks = data.tasks.filter((task) => taskOpen(task) && (!task.listId || activeLists.has(task.listId)));
  const selectedTask = tasks.find((task) => task.id === taskId);
  const sessions = state?.history ?? [];
  const todaySessions = sessions.filter((session) => dayISO(new Date(session.finishedAt)) === dayISO(new Date(now)));
  const todayMinutes = Math.round(todaySessions.reduce((total, session) => total + session.duration, 0) / 60000);
  const displayTime = timer?.target != null ? Math.max(0, timer.target - spent) : timer ? spent : mode === "pomodoro" ? minutes * 60000 : 0;

  useEffect(() => {
    function read() {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as FocusState | null;
        setState(Array.isArray(saved?.history) ? saved : EMPTY);
      } catch {
        setState(EMPTY);
      }
      setNow(Date.now());
    }
    function sync(event: StorageEvent) {
      if (event.key === KEY) read();
    }
    read();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, running ? 250 : 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [running]);

  function update(next: FocusState) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Keep this session usable in memory. */ }
    setState(next);
    setNow(Date.now());
  }

  return (
    <section className="stage workspace-stage">
      <header><h1>Focus</h1></header>
      <div className="workspace-body focus-workspace">
        <section className="focus-panel">
          {timer ? <div className="focus-mode">{timer.target == null ? "Stopwatch" : "Pomodoro"}</div> : (
            <div className="focus-modes" role="group" aria-label="Timer mode">
              {MODES.map(([id, label]) => <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>{label}</button>)}
            </div>
          )}
          <div className="focus-clock" role="timer" aria-label="Focus time">{clock(timer?.target != null ? Math.ceil(displayTime / 1000) * 1000 : displayTime)}</div>
          {timer?.target != null && <progress className="focus-progress" aria-label="Session progress" max={timer.target} value={Math.min(spent, timer.target)} />}
          {timer && state ? (
            <>
              <p role="status">{done ? "Session complete" : running ? timer.title : `Paused · ${timer.title}`}</p>
              <div className="focus-actions">
                {!done && <button type="button" className="primary" onClick={() => {
                  const timestamp = Date.now();
                  const duration = elapsed(timer, timestamp);
                  if (timer.target != null && duration >= timer.target) {
                    setNow(timestamp);
                    return;
                  }
                  update({ ...state, timer: { ...timer, accumulated: duration, startedAt: running ? null : timestamp } });
                }}>{running ? "Pause" : "Resume"}</button>}
                <button type="button" className="text-button" onClick={() => {
                  const timestamp = Date.now();
                  const elapsedTime = elapsed(timer, timestamp);
                  const duration = Math.min(elapsedTime, timer.target ?? Infinity);
                  const finishedAt = timestamp - (elapsedTime - duration);
                  update({ timer: null, history: [{ id: crypto.randomUUID(), title: timer.title, duration, finishedAt }, ...state.history] });
                }}>Finish session</button>
                <button type="button" className="text-button" onClick={() => update({ ...state, timer: null })}>Discard</button>
              </div>
            </>
          ) : (
            <form className="focus-actions" onSubmit={(event) => {
              event.preventDefault();
              if (!state || (mode === "pomodoro" && (!Number.isInteger(minutes) || minutes < 1 || minutes > 180))) return;
              update({ ...state, timer: { taskId: selectedTask?.id ?? "", title: selectedTask?.title ?? "Open focus", target: mode === "pomodoro" ? minutes * 60000 : null, startedAt: Date.now(), accumulated: 0 } });
            }}>
              {mode === "pomodoro" && (
                <label className="focus-minutes">
                  <input aria-label="Focus minutes" type="number" min={1} max={180} required value={minutes || ""} onChange={(event) => setMinutes(Number(event.target.value))} />
                  <span>min</span>
                </label>
              )}
              <select aria-label="Task" value={selectedTask?.id ?? ""} onChange={(event) => setTaskId(event.target.value)}>
                <option value="">Open focus</option>
                {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
              <button className="primary" disabled={!state}>Start</button>
            </form>
          )}
        </section>
        <section className="workspace-card focus-history">
          <div className="workspace-card-head"><h2>Recent sessions</h2><span>{todayMinutes} min today</span></div>
          <p className="hint">Saved in this browser.</p>
          {sessions.length ? sessions.slice(0, 20).map((session) => (
            <div className="settings-row" key={session.id}>
              <div><strong>{session.title}</strong><small>{new Date(session.finishedAt).toLocaleDateString()}</small></div>
              <span>{clock(session.duration)}</span>
            </div>
          )) : <p className="workspace-empty">Finished sessions appear here.</p>}
        </section>
      </div>
    </section>
  );
}
