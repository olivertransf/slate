"use client";

import { useEffect, useState } from "react";
import { addDays, type ListRecord, type TagRecord, type TaskRecord } from "@/lib/model";

export type TaskFilter = {
  query: string;
  status: "open" | "all" | "completed";
  when: "" | "today" | "week" | "overdue" | "unscheduled";
  priority: string;
  listId: string;
  tagId: string;
  recurring: boolean;
};
type SavedFilter = { id: string; name: string; filter: TaskFilter };

export const DEFAULT_FILTER: TaskFilter = {
  query: "", status: "open", when: "", priority: "", listId: "", tagId: "", recurring: false,
};

const KEY = "slate-saved-filters";

export function matchesFilter(task: TaskRecord, filter: TaskFilter, today: string): boolean {
  if (filter.status === "open" && task.completedAt) return false;
  if (filter.status === "completed" && !task.completedAt) return false;
  if (filter.priority && String(task.priority) !== filter.priority) return false;
  if (filter.listId && task.listId !== filter.listId) return false;
  if (filter.tagId && !task.tagIds.includes(filter.tagId)) return false;
  if (filter.recurring && !task.repeat) return false;
  if (filter.when === "today") return task.startOn === today || task.dueOn === today;
  if (filter.when === "overdue") return !!task.dueOn && task.dueOn < today;
  if (filter.when === "unscheduled") return !task.dueOn && !task.startOn;
  if (filter.when === "week") {
    const end = addDays(today, 6);
    return [task.startOn, task.dueOn].some((date) => !!date && date >= today && date <= end);
  }
  return true;
}

export function SearchFilters({ value, onChange, lists, tags }: {
  value: TaskFilter;
  onChange: (value: TaskFilter) => void;
  lists: ListRecord[];
  tags: TagRecord[];
}) {
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(stored)) setSaved(stored);
    } catch {
      setSaved([]);
    }
  }, []);

  function store(next: SavedFilter[]) {
    localStorage.setItem(KEY, JSON.stringify(next));
    setSaved(next);
  }

  function patch(partial: Partial<TaskFilter>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="search-filter-panel">
      <div className="task-search-controls">
        <input className="task-search" type="search" aria-label="Search tasks" placeholder="Search task titles and notes" autoFocus value={value.query} onChange={(event) => patch({ query: event.target.value })} />
        <select aria-label="Task status" value={value.status} onChange={(event) => patch({ status: event.target.value as TaskFilter["status"] })}>
          <option value="open">Open</option><option value="completed">Completed</option><option value="all">All statuses</option>
        </select>
        <select aria-label="Date range" value={value.when} onChange={(event) => patch({ when: event.target.value as TaskFilter["when"] })}>
          <option value="">Any date</option><option value="today">Today</option><option value="week">Next 7 days</option><option value="overdue">Overdue</option><option value="unscheduled">Unscheduled</option>
        </select>
        <select aria-label="Project" value={value.listId} onChange={(event) => patch({ listId: event.target.value })}>
          <option value="">All projects</option>
          {value.listId && !lists.some((list) => list.id === value.listId) && <option value={value.listId}>Unavailable project</option>}
          {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
        </select>
        <select aria-label="Tag" value={value.tagId} onChange={(event) => patch({ tagId: event.target.value })}>
          <option value="">All tags</option>
          {value.tagId && !tags.some((tag) => tag.id === value.tagId) && <option value={value.tagId}>Unavailable tag</option>}
          {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select>
        <select aria-label="Priority" value={value.priority} onChange={(event) => patch({ priority: event.target.value })}>
          <option value="">Any priority</option><option value="3">High</option><option value="2">Medium</option><option value="1">Low</option><option value="0">None</option>
        </select>
        <label><input type="checkbox" checked={value.recurring} onChange={(event) => patch({ recurring: event.target.checked })} /> Recurring</label>
      </div>
      <form className="task-search-controls" onSubmit={(event) => {
        event.preventDefault();
        const clean = name.trim();
        if (!clean) return;
        const entry = { id: selected || crypto.randomUUID(), name: clean, filter: value };
        store(selected ? saved.map((item) => item.id === selected ? entry : item) : [...saved, entry]);
        setSelected(entry.id);
      }}>
        <select aria-label="Saved filter" value={selected} onChange={(event) => {
          const entry = saved.find((item) => item.id === event.target.value);
          setSelected(entry?.id ?? "");
          setName(entry?.name ?? "");
          onChange(entry?.filter ?? DEFAULT_FILTER);
        }}>
          <option value="">New filter</option>
          {saved.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
        <input className="task-search" aria-label="Filter name" placeholder="Filter name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        <button className="text-button" disabled={!name.trim()}>{selected ? "Update filter" : "Save filter"}</button>
        {selected && <button className="text-button" type="button" onClick={() => {
          store(saved.filter((item) => item.id !== selected));
          setSelected("");
          setName("");
        }}>Remove filter</button>}
      </form>
    </div>
  );
}
