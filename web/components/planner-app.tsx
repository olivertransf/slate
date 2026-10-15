"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { patchUi, useUiSettings } from "@/lib/ui-settings";
import { CalendarView } from "./calendar";
import { CountdownView } from "./countdowns";
import { HabitView } from "./habits";
import { PlannerProvider, usePlanner } from "./planner-context";
import { SettingsView } from "./settings-view";
import { Sidebar } from "./sidebar";
import { TaskColumn, TaskDetail } from "./tasks";
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
  const { error, syncing } = usePlanner();
  const settings = useUiSettings();
  const [view, setView] = useState("today");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<"nav" | "list" | "detail" | "stage">("list");
  const [notice, setNotice] = useState<string | null>(null);
  const wide = stageView(view);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "n") {
        document.querySelector<HTMLInputElement>(".quick input")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
    setPane(stageView(next) ? "stage" : "list");
  }

  function chooseTask(id: string) {
    const next = selectedId === id ? null : id;
    setSelectedId(next);
    setPane(next ? "detail" : wide ? "stage" : "list");
  }

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
        />
      )}
      {view === "calendar" && <CalendarView onSelect={chooseTask} />}
      {view === "habits" && <HabitView />}
      {view === "countdowns" && <CountdownView />}
      {view === "settings" && <SettingsView notice={notice} />}
      {detailOpen && <div className="resize resize-detail" role="separator" aria-orientation="vertical" aria-label="Resize details" onPointerDown={(event) => dragWidth(event, "detail")} />}
      {(!wide || detailOpen) && (
        <TaskDetail
          taskId={selectedId}
          open={detailOpen}
          onClose={() => { setSelectedId(null); setPane(wide ? "stage" : "list"); }}
        />
      )}
      {(error || syncing) && <div className="toast">{syncing ? "Syncing" : error}</div>}
      <nav className="tabs">
        {[["today", "Tasks"], ["calendar", "Calendar"], ["habits", "Habits"], ["countdowns", "Countdown"]].map(([id, label]) => (
          <button key={id} className={view === id || (id === "today" && !wide) ? "on" : ""} onClick={() => chooseView(id === "today" ? "today" : id)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
