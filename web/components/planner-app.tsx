"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { patchUi, useUiSettings } from "@/lib/ui-settings";
import { CommandPalette } from "./command-palette";
import { CalendarView } from "./calendar";
import { CountdownView } from "./countdowns";
import { FocusView } from "./focus";
import { HabitView } from "./habits";
import { PlannerProvider, today, usePlanner } from "./planner-context";
import { ReviewView } from "./review";
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
  return view === "calendar" || view === "habits" || view === "focus" || view === "review" || view === "countdowns" || view === "settings";
}

function Shell() {
  const { error, syncState, retrySync, undo, canUndo, data, completeTask } = usePlanner();
  const settings = useUiSettings();
  const [view, setView] = useState("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<"nav" | "list" | "detail" | "stage">("list");
  const [undoVisible, setUndoVisible] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [previousPane, setPreviousPane] = useState<"list" | "detail" | "stage">("list");
  const [calDay, setCalDay] = useState(today());
  const wide = stageView(view);
  const canAdd = !["settings", "focus", "review", "completed", "trash"].includes(view);

  useEffect(() => {
    if (!canUndo) { setUndoVisible(false); return; }
    setUndoVisible(true);
    const timer = window.setTimeout(() => setUndoVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, [canUndo, data]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.isComposing || event.defaultPrevented || addOpen) return;
      const target = event.target as HTMLElement | null;
      const editing = target?.closest("input, textarea, select, [contenteditable=true]");
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMenuOpen(false);
        setPalette(true);
        return;
      }
      if (palette) return;
      if (event.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        return;
      }
      if (editing || event.altKey || event.shiftKey) return;
      if (meta && event.key.toLowerCase() === "z" && canUndo) {
        event.preventDefault();
        undo();
        return;
      }
      if (meta) return;
      if (event.key === "Escape") {
        setSelectedId(null);
        setPane(stageView(view) ? "stage" : "list");
      }
      if (event.key === "n" && canAdd) {
        event.preventDefault();
        const inline = document.querySelector<HTMLInputElement>(".desktop-quick input");
        if (inline && inline.getClientRects().length) inline.focus();
        else setAddOpen(true);
      }
      if (event.key === "/") {
        event.preventDefault();
        setPalette(true);
      }
      if (event.key === "1") chooseView("today");
      if (event.key === "2") chooseView("calendar");
      if (event.key === "3") chooseView("habits");
      if (event.key === "4") chooseView("countdowns");
      if (event.key === "c" && selectedId && pane !== "nav") {
        const task = data.tasks.find((item) => item.id === selectedId && !item.deletedAt && item.kind !== "note");
        if (!task) return;
        completeTask(task);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen, canAdd, canUndo, completeTask, data.tasks, menuOpen, palette, pane, selectedId, undo, view]);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
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
    setSelectedId(id);
    setPane("detail");
  }

  function openCommandTask(id: string) {
    const task = data.tasks.find((item) => item.id === id && !item.deletedAt);
    if (!task) return;
    chooseView(task.completedAt ? "completed" : task.listId ? `list:${task.listId}` : "inbox");
    chooseTask(id);
  }

  const detailOpen = selectedId != null && data.tasks.some((task) => task.id === selectedId && (!task.deletedAt || view === "trash"));
  useEffect(() => {
    if (!selectedId || detailOpen) return;
    setSelectedId(null);
    setPane((current) => current === "detail" ? (wide ? "stage" : "list") : current);
  }, [detailOpen, selectedId, wide]);

  function toggleNavigation() {
    if (pane === "nav") {
      setPane(previousPane === "detail" && !detailOpen ? (wide ? "stage" : "list") : previousPane);
    } else {
      setPreviousPane(pane);
      setPane("nav");
    }
  }
  const className = ["shell", wide ? "wide" : "", detailOpen ? "drawer" : "", sidebarCollapsed ? "sidebar-collapsed" : ""].filter(Boolean).join(" ");

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
      window.removeEventListener("pointercancel", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  return (
    <>
    <div
      className={className}
      data-pane={pane}
      style={{ ["--sidebar-w" as string]: `${settings.sidebar}px`, ["--detail-w" as string]: settings.detail === 498 ? "max(280px, calc((100vw - 50px) * 0.36))" : `${settings.detail}px` }}
    >
      <Sidebar view={view} onView={chooseView} onCommands={() => setPalette(true)} />
      {!wide && <div className="resize resize-sidebar" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" tabIndex={0} aria-valuemin={180} aria-valuemax={420} aria-valuenow={settings.sidebar} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); patchUi({ sidebar: settings.sidebar + (event.key === "ArrowRight" ? 10 : -10) }); } }} onPointerDown={(event) => dragWidth(event, "sidebar")} />}
      {!wide && (
        <TaskColumn
          key={view}
          view={view}
          selectedId={selectedId}
          onSelect={chooseTask}
          onLists={() => window.matchMedia("(min-width: 981px)").matches ? setSidebarCollapsed((value) => !value) : setMenuOpen(true)}
          addOpen={addOpen}
          onAddClose={() => setAddOpen(false)}
        />
      )}
      {view === "calendar" && <CalendarView onSelect={chooseTask} onMenu={() => setMenuOpen(true)} onDay={setCalDay} />}
      {view === "calendar" && addOpen && (
        <TaskAddSheet defaultDay={calDay} onClose={() => setAddOpen(false)} onAdded={(task) => chooseTask(task.id)} />
      )}
      {view === "review" && <ReviewView onTask={chooseTask} onView={chooseView} />}
      {view === "focus" && <FocusView />}
      {view === "habits" && <HabitView addOpen={addOpen} onAddClose={() => setAddOpen(false)} />}
      {view === "countdowns" && <CountdownView onProject={(id) => chooseView(`list:${id}`)} addOpen={addOpen} onAddClose={() => setAddOpen(false)} />}
      {view === "settings" && <SettingsView notice={notice} />}
      {detailOpen && <div className="resize resize-detail" role="separator" aria-orientation="vertical" aria-label="Resize details" tabIndex={0} aria-valuemin={280} aria-valuemax={640} aria-valuenow={settings.detail} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); patchUi({ detail: settings.detail + (event.key === "ArrowLeft" ? 10 : -10) }); } }} onPointerDown={(event) => dragWidth(event, "detail")} />}
      {(!wide || detailOpen) && (
        <TaskDetail
          key={selectedId ?? "empty"}
          taskId={selectedId}
          open={detailOpen}
          onClose={() => { setSelectedId(null); setPane(wide ? "stage" : "list"); }}
        />
      )}
      {(error || undoVisible) && (
        <div className="toast">
          <span role="status">{error ?? (syncState === "idle" ? "Changes saved" : "Saving changes…")}</span>
          {syncState === "offline" && <button type="button" onClick={retrySync}>Retry</button>}
          {canUndo && <button type="button" onClick={undo}>Undo</button>}
        </div>
      )}
      {canAdd && (
        <button type="button" className="fab" aria-label={view === "habits" ? "Add habit" : view === "countdowns" ? "Add countdown" : "Add task"} onClick={() => setAddOpen(true)}>+</button>
      )}
      {palette && <CommandPalette onClose={() => setPalette(false)} onView={chooseView} onTask={openCommandTask} />}
      <nav className="tabs" aria-label="Sections">
        {[
          ["today", "Tasks"],
          ["calendar", "Calendar"],
          ["habits", "Habits"],
          ["countdowns", "Countdown"],
          ["more", "More"],
        ].map(([id, label]) => (
          <button key={id} type="button" aria-current={(id === "today" ? !wide && pane !== "nav" : id === "more" ? pane === "nav" : view === id && pane !== "nav") ? "page" : undefined} className={(id === "today" ? !wide && pane !== "nav" : id === "more" ? pane === "nav" : view === id && pane !== "nav") ? "on" : ""} onClick={() => id === "more" ? toggleNavigation() : chooseView(id)}>
            <TabIcon id={id} />
            {label}
          </button>
        ))}
      </nav>
      <ReminderLoop />
    </div>
    {menuOpen && (
      <div className="menu-drawer">
        <button type="button" className="menu-dim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
        <div
          className="menu-panel"
          onTouchStart={(event) => { event.currentTarget.dataset.x = String(event.touches[0]?.clientX ?? 0); }}
          onTouchEnd={(event) => {
            const start = Number(event.currentTarget.dataset.x ?? 0);
            if (start - (event.changedTouches[0]?.clientX ?? start) > 60) setMenuOpen(false);
          }}
        >
          <Sidebar view={view} onView={(next) => { chooseView(next); setMenuOpen(false); }} onCommands={() => { setMenuOpen(false); setPalette(true); }} />
        </div>
      </div>
    )}
    </>
  );
}

const TAB_ICONS: Record<string, string> = {
  today: "M5 6h2l1 1 2-2M12 6h7M5 12h2l1 1 2-2M12 12h7M5 18h2l1 1 2-2M12 18h7",
  calendar: "M5 6h14v14H5zM5 10h14M8 4v4M16 4v4",
  habits: "M7 7h.01M17 7h.01M7 17h.01M17 17h.01",
  countdowns: "M12 8v4l3 2M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

function TabIcon({ id }: { id: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={id === "more" || id === "habits" ? 3.5 : 1.7} strokeLinecap="round" strokeLinejoin="round"><path d={TAB_ICONS[id]} /></svg>;
}

function ReminderLoop() {
  const { data } = usePlanner();
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    function check() {
      if (Notification.permission !== "granted") return;
      const now = Date.now();
      for (const task of data.tasks) {
        if (task.deletedAt || task.completedAt || task.remindMinutesBefore == null || !task.dueOn) continue;
        const [hour, minute] = (task.dueTime ?? "09:00").split(":").map(Number);
        const due = new Date(`${task.dueOn}T00:00:00`);
        due.setHours(hour || 0, minute || 0, 0, 0);
        const at = due.getTime() - task.remindMinutesBefore * 60_000;
        const key = `${task.id}:${task.dueOn}:${task.dueTime ?? ""}:${task.remindMinutesBefore}`;
        if (at > now || now - at > 60_000) continue;
        const storageKey = `slate-reminder:${task.id}`;
        if (localStorage.getItem(storageKey) === key) continue;
        const options = { body: "Task reminder", tag: key };
        if (navigator.serviceWorker?.controller) {
          void navigator.serviceWorker.getRegistration().then((registration) => registration?.showNotification(task.title, options)).catch(() => {});
        } else {
          try { new Notification(task.title, options); } catch { continue; }
        }
        localStorage.setItem(storageKey, key);
      }
    }
    check();
    const timer = window.setInterval(check, 15_000);
    return () => window.clearInterval(timer);
  }, [data.tasks]);
  return null;
}
