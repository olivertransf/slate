"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { patchUi, useUiSettings } from "@/lib/ui-settings";
import { CalendarView } from "./calendar";
import { CountdownView } from "./countdowns";
import { HabitView } from "./habits";
import { PlannerProvider, today, usePlanner } from "./planner-context";
import { SettingsView } from "./settings-view";
import { Sidebar } from "./sidebar";
import { TaskAddSheet, TaskColumn, TaskDetail } from "./tasks";
import { Unlock } from "./unlock";

export function PlannerApp() {
  return (
    <PlannerProvider>
      <Gate />
    </PlannerProvider>
  );
}

function Gate() {
  const { ready, unlocked } = usePlanner();
  if (!ready) return <main className="unlock"><p>Loading</p></main>;
  if (!unlocked) return <Unlock />;
  return <Shell />;
}

function stageView(view: string): boolean {
  return view === "calendar" || view === "habits" || view === "countdowns" || view === "settings";
}

function Shell() {
  const { error, syncing, syncState, undo, canUndo, data, completeTask } = usePlanner();
  const settings = useUiSettings();
  const [view, setView] = useState("today");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<"nav" | "list" | "detail" | "stage">("list");
  const [notice, setNotice] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [command, setCommand] = useState("");
  const wide = stageView(view);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(true);
        return;
      }
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
        return;
      }
      if (event.key === "n" || event.key === "/") {
        event.preventDefault();
        setAddOpen(true);
      }
      if (event.key === "1") chooseView("today");
      if (event.key === "2") chooseView("calendar");
      if (event.key === "3") chooseView("habits");
      if (event.key === "4") chooseView("countdowns");
      if (event.key === "c" && selectedId) {
        const task = data.tasks.find((item) => item.id === selectedId);
        if (!task) return;
        if (event.key === "c") completeTask(task);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [completeTask, data.tasks, selectedId, undo]);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
  }, []);

  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get("google");
    if (!flag) return;
    setNotice(flag === "connected" ? "Google Calendar is connected." : "Google sign-in did not finish. Add the redirect URI in Cloud Console, then try again.");
    setView("settings");
    setPane("stage");
    window.history.replaceState(null, "", "/");
  }, []);

  function chooseView(next: string) {
    setView(next);
    setSelectedId(null);
    setAddOpen(false);
    setPane(stageView(next) ? "stage" : "list");
  }

  function chooseTask(id: string) {
    const next = selectedId === id ? null : id;
    setSelectedId(next);
    setPane(next ? "detail" : wide ? "stage" : "list");
  }

  const commands = [
    { label: "Today", run: () => chooseView("today") },
    { label: "Calendar", run: () => chooseView("calendar") },
    { label: "Habits", run: () => chooseView("habits") },
    { label: "Countdowns", run: () => chooseView("countdowns") },
    { label: "Settings", run: () => chooseView("settings") },
    ...data.tasks.filter((task) => !task.deletedAt).slice(0, 40).map((task) => ({
      label: task.title,
      run: () => { chooseView(task.listId ? `list:${task.listId}` : "inbox"); chooseTask(task.id); },
    })),
  ];
  const detailOpen = selectedId != null;
  const className = ["shell", wide ? "wide" : "", detailOpen ? "drawer" : ""].filter(Boolean).join(" ");

  function dragWidth(event: ReactPointerEvent<HTMLDivElement>, key: "sidebar" | "detail") {
    event.preventDefault();
    const startX = event.clientX;
    const start = key === "sidebar" ? settings.sidebar : settings.detail;
    const sign = key === "detail" ? -1 : 1;
    function move(next: PointerEvent) {
      patchUi({ [key]: start + (next.clientX - startX) * sign });
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      className={className}
      data-pane={pane}
      style={{ ["--sidebar-w" as string]: `${settings.sidebar}px`, ["--detail-w" as string]: `${settings.detail}px` }}
    >
      <Sidebar view={view} onView={chooseView} />
      {!wide && <div className="resize resize-sidebar" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" onPointerDown={(event) => dragWidth(event, "sidebar")} />}
      {!wide && (
        <TaskColumn
          view={view}
          selectedId={selectedId}
          onSelect={chooseTask}
          onLists={() => setPane("nav")}
          addOpen={addOpen}
          onAddClose={() => setAddOpen(false)}
        />
      )}
      {view === "calendar" && <CalendarView onSelect={chooseTask} />}
      {view === "calendar" && addOpen && (
        <TaskAddSheet defaultDay={today()} onClose={() => setAddOpen(false)} onAdded={(task) => chooseTask(task.id)} />
      )}
      {view === "habits" && <HabitView addOpen={addOpen} onAddClose={() => setAddOpen(false)} />}
      {view === "countdowns" && <CountdownView addOpen={addOpen} onAddClose={() => setAddOpen(false)} />}
      {view === "settings" && <SettingsView notice={notice} />}
      {detailOpen && <div className="resize resize-detail" role="separator" aria-orientation="vertical" aria-label="Resize details" onPointerDown={(event) => dragWidth(event, "detail")} />}
      {(!wide || detailOpen) && (
        <TaskDetail
          taskId={selectedId}
          open={detailOpen}
          onClose={() => { setSelectedId(null); setPane(wide ? "stage" : "list"); }}
        />
      )}
      {(error || syncing || syncState === "conflict") && (
        <div className="toast" role="status">
          {syncing || syncState === "syncing" ? "Syncing" : syncState === "conflict" ? "Synced the latest copy" : error}
          {canUndo && <button type="button" onClick={undo}>Undo</button>}
        </div>
      )}
      {view !== "settings" && view !== "completed" && view !== "trash" && (
        <button type="button" className="fab" aria-label="Add" onClick={() => setAddOpen(true)}>+</button>
      )}
      {palette && (
        <form className="palette" role="dialog" aria-modal="true" aria-label="Commands" onSubmit={(event) => {
          event.preventDefault();
          const match = commands.find((item) => item.label.toLowerCase().includes(command.toLowerCase()));
          match?.run();
          setPalette(false);
          setCommand("");
        }}>
          <input autoFocus aria-label="Command" placeholder="Jump to a view or task" value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setPalette(false); }} />
          {commands.filter((item) => item.label.toLowerCase().includes(command.toLowerCase())).slice(0, 8).map((item) => (
            <button key={item.label} type="button" onClick={() => { item.run(); setPalette(false); setCommand(""); }}>{item.label}</button>
          ))}
        </form>
      )}
      <nav className="tabs" aria-label="Sections">
        {[
          ["today", "Tasks"],
          ["calendar", "Calendar"],
          ["habits", "Habits"],
          ["countdowns", "Countdown"],
          ["more", "More"],
        ].map(([id, label]) => (
          <button key={id} type="button" className={(id === "today" ? !wide && pane !== "nav" : id === "more" ? pane === "nav" : view === id) ? "on" : ""} onClick={() => id === "more" ? setPane("nav") : chooseView(id === "today" ? "today" : id)}>
            {label}
          </button>
        ))}
      </nav>
      <ReminderLoop />
    </div>
  );
}

function ReminderLoop() {
  const { data } = usePlanner();
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") void Notification.requestPermission();
    const seen = new Set<string>();
    const timer = window.setInterval(() => {
      if (Notification.permission !== "granted") return;
      const now = Date.now();
      for (const task of data.tasks) {
        if (task.deletedAt || task.completedAt || task.remindMinutesBefore == null || !task.dueOn) continue;
        const [hour, minute] = (task.dueTime ?? "09:00").split(":").map(Number);
        const due = new Date(`${task.dueOn}T00:00:00`);
        due.setHours(hour || 0, minute || 0, 0, 0);
        const at = due.getTime() - task.remindMinutesBefore * 60_000;
        const key = `${task.id}:${task.dueOn}:${task.dueTime ?? ""}:${task.remindMinutesBefore}`;
        if (seen.has(key) || at > now || now - at > 60_000) continue;
        seen.add(key);
        new Notification(task.title, { body: "Due now" });
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [data.tasks]);
  return null;
}
