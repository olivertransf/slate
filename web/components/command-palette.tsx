"use client";

import { useEffect, useRef, useState } from "react";
import { searchTasks } from "@/lib/model";
import { usePlanner } from "./planner-context";

const VIEWS = [
  ["inbox", "Inbox"], ["today", "Today"], ["tomorrow", "Tomorrow"], ["week", "Next 7 Days"],
  ["upcoming", "Upcoming"], ["overdue", "Overdue"], ["anytime", "Anytime"], ["someday", "Someday"],
  ["search", "Search"], ["calendar", "Calendar"], ["focus", "Focus"], ["review", "Weekly review"],
  ["habits", "Habits"], ["countdowns", "Countdowns"], ["completed", "Completed"], ["trash", "Trash"],
  ["settings", "Settings"],
] as const;

export function CommandPalette({ onClose, onView, onTask }: {
  onClose: () => void;
  onView: (view: string) => void;
  onTask: (id: string) => void;
}) {
  const { data } = usePlanner();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const term = query.trim().toLowerCase();
  const views = VIEWS.filter(([, title]) => title.toLowerCase().includes(term))
    .map(([id, title]) => ({ id: `view-${id}`, title, kind: "View", run: () => onView(id) }));
  const lists = term ? data.lists.filter((list) => !list.deletedAt && list.name.toLowerCase().includes(term))
    .map((list) => ({ id: `list-${list.id}`, title: list.name, kind: "List", run: () => onView(`list:${list.id}`) })) : [];
  const tasks = term ? searchTasks(data.tasks.filter((task) => !task.deletedAt), term)
    .map((task) => ({ id: `task-${task.id}`, title: task.title, kind: task.completedAt ? "Completed" : "Task", run: () => onTask(task.id) })) : [];
  const results = [...views, ...lists, ...tasks].sort((left, right) => {
    const rank = (title: string) => title === term ? 0 : title.startsWith(term) ? 1 : title.includes(term) ? 2 : 3;
    return rank(left.title.toLowerCase()) - rank(right.title.toLowerCase());
  }).slice(0, term ? 30 : VIEWS.length);
  const current = Math.min(active, results.length - 1);
  const activeId = results[current]?.id;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    if (!activeId) return;
    document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function run(index: number) {
    const result = results[index];
    if (!result) return;
    result.run();
    onClose();
  }

  return (
    <dialog ref={dialog} className="palette" aria-label="Jump to anything"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form onSubmit={(event) => { event.preventDefault(); run(current); }}>
        <div className="palette-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></svg>
          <input autoFocus role="combobox" aria-label="Find a task, list, or view" aria-expanded="true" aria-controls="command-results"
            aria-activedescendant={activeId} autoComplete="off" placeholder="Find a task, list, or view"
            value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={(event) => {
              if (!results.length || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
              event.preventDefault();
              setActive((current + (event.key === "ArrowDown" ? 1 : results.length - 1)) % results.length);
            }} />
          <button className="palette-close" type="button" onClick={onClose} aria-label="Close commands">Esc</button>
        </div>
        <div id="command-results" role="listbox" aria-label="Matching commands">
          {results.map((item, index) => (
            <button key={item.id} id={item.id} type="button" role="option" tabIndex={-1} aria-selected={index === current}
              onPointerMove={() => setActive(index)} onClick={() => run(index)}>
              <span>{item.title}</span><small>{item.kind}</small>
            </button>
          ))}
        </div>
        {!results.length && <p role="status">No results for “{query.trim()}”</p>}
      </form>
    </dialog>
  );
}
