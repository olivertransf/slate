"use client";

import { useEffect, useState, type FormEvent } from "react";
import { alive, matchesView, visibleLists, type ListRecord, type TagRecord } from "@/lib/model";
import { newId, today, usePlanner } from "./planner-context";

const VIEWS = [
  ["inbox", "Inbox", "M4 14h4.2l1-2h5.6l1 2H20M5.2 14V8.2A1.2 1.2 0 0 1 6.4 7h11.2a1.2 1.2 0 0 1 1.2 1.2V14M4.2 14v4.2A1.2 1.2 0 0 0 5.4 19.4h13.2a1.2 1.2 0 0 0 1.2-1.2V14"],
  ["today", "Today", "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 3v1.6M12 19.4V21M3 12h1.6M19.4 12H21M5.1 5.1l1.1 1.1M17.8 17.8l1.1 1.1M18.9 5.1l-1.1 1.1M6.2 17.8l-1.1 1.1"],
  ["tomorrow", "Tomorrow", "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM8.2 18.6A6.5 6.5 0 0 1 12 5.5"],
  ["week", "Next 7 Days", "M5 5.5h14A1.5 1.5 0 0 1 20.5 7v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5zM3.5 10h17M8 3.5v4M16 3.5v4"],
  ["overdue", "Overdue", "M12 8v4M12 16h.01M12 3.5 20 19.5H4z"],
] as const;

const COLORS = ["#8C5EFA", "#4772FA", "#22A06B", "#E5484D", "#F5A524"];

const RAIL = [
  ["calendar", "Calendar", "M5 5.5h14A1.5 1.5 0 0 1 20.5 7v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5zM3.5 10h17M8 3.5v4M16 3.5v4"],
  ["habits", "Habits", "M8 7.5a2.2 2.2 0 1 0 0.01 0zM16 7.5a2.2 2.2 0 1 0 0.01 0zM8 16.5a2.2 2.2 0 1 0 0.01 0zM16 16.5a2.2 2.2 0 1 0 0.01 0z"],
  ["countdowns", "Countdowns", "M12 7.2V12l2.4 1.6M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4z"],
] as const;

export function Sidebar({
  view,
  onView,
}: {
  view: string;
  onView: (view: string) => void;
}) {
  const { data, save, lock } = usePlanner();
  const lists = visibleLists(data.lists);
  const archived = alive(data.lists).filter((list) => list.archivedAt).sort((a, b) => a.sort - b.sort);
  const tags = alive(data.tags);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const day = today();
  const countFor = (id: string) => data.tasks.filter((task) => matchesView(task, id, day)).length;
  const tasksOn = view === "inbox" || view === "today" || view === "tomorrow" || view === "week" || view.startsWith("list:") || view.startsWith("tag:");

  function startEdit(list: ListRecord) {
    setEditingId(list.id);
    setNameDraft(list.name);
  }

  function commitEdit(list: ListRecord) {
    const name = nameDraft.trim();
    setEditingId(null);
    if (!name || name === list.name) return;
    save("lists", { ...list, name });
  }

  function recolor(list: ListRecord, color: string) {
    save("lists", { ...list, color });
  }

  function archiveList(list: ListRecord) {
    save("lists", { ...list, archivedAt: list.archivedAt ? null : new Date().toISOString() });
    if (view === `list:${list.id}`) onView("inbox");
  }

  function removeList(list: ListRecord) {
    save("lists", { ...list, deletedAt: new Date().toISOString() });
    if (view === `list:${list.id}`) onView("inbox");
    setEditingId(null);
  }

  function removeTag(tag: TagRecord) {
    save("tags", { ...tag, deletedAt: new Date().toISOString() });
    if (view === `tag:${tag.id}`) onView("inbox");
  }

  function addList(event: FormEvent) {
    event.preventDefault();
    const name = draft.trim();
    if (!name) return;
    const record: ListRecord = {
      id: newId(),
      name: name.trim(),
      color: COLORS[lists.length % COLORS.length] ?? "#4C6FFF",
      sort: Date.now(),
      sections: [],
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };
    save("lists", record);
    setDraft("");
    setAdding(false);
    onView(`list:${record.id}`);
  }

  return (
    <>
    <nav className="rail" aria-label="Apps">
      <div className="mark">S</div>
      <button type="button" aria-label="Tasks" className={tasksOn ? "on" : ""} onClick={() => onView("inbox")}>
        <NavIcon d="M6 12.5 10 16.5 18 7.5" />
      </button>
      {RAIL.map(([id, label, icon]) => (
        <button key={id} type="button" className={view === id ? "on" : ""} aria-label={label} title={label} onClick={() => onView(id)}>
          <NavIcon d={icon} />
        </button>
      ))}
      <div className="rail-gap" />
      <button type="button" aria-label="Settings" title="Settings" className={view === "settings" ? "on" : ""} onClick={() => onView("settings")}>
        <NavIcon d="M12 8.4a3.6 3.6 0 1 0 .01 0zM12 3.2v1.5M12 19.3V20.8M4.7 6.1l1.1 1.1M18.2 16.8l1.1 1.1M3.2 12h1.5M19.3 12h1.5M4.7 17.9l1.1-1.1M18.2 7.2 17.1 6.1" />
      </button>
      <ThemeToggle />
      <button type="button" aria-label="Lock" title="Lock" onClick={() => void lock()}>
        <NavIcon d="M8 11V8.2a4 4 0 0 1 8 0V11M6.5 11h11v8h-11z" />
      </button>
    </nav>
    <aside className="sidebar">
      <div className="nav-scroll">
        {VIEWS.map(([id, label, icon]) => (
          <button key={id} className={view === id ? "nav-button active" : "nav-button"} onClick={() => onView(id)}>
            <NavIcon d={icon} />
            <span className="nav-label">{label}</span>
            {countFor(id) > 0 && <span className="nav-count">{countFor(id)}</span>}
          </button>
        ))}
        <div className="nav-rule" />
        <div className="group-label">Lists</div>
        {lists.map((list) =>
          editingId === list.id ? (
            <form key={list.id} className="list-edit" onSubmit={(event) => { event.preventDefault(); commitEdit(list); }}>
              <input
                aria-label="List name"
                value={nameDraft}
                autoFocus
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={() => commitEdit(list)}
                onKeyDown={(event) => { if (event.key === "Escape") setEditingId(null); }}
              />
              <div className="swatches">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={list.color === color ? "on" : ""}
                    style={{ background: color }}
                    aria-label={`Color ${color}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => recolor(list, color)}
                  />
                ))}
                <button type="button" className="text-button" onMouseDown={(event) => event.preventDefault()} onClick={() => archiveList(list)}>
                  {list.archivedAt ? "Unarchive" : "Archive"}
                </button>
                <button type="button" className="text-button" onMouseDown={(event) => event.preventDefault()} onClick={() => removeList(list)}>
                  Delete
                </button>
              </div>
            </form>
          ) : (
            <div key={list.id} className="nav-item">
              <button
                className={view === `list:${list.id}` ? "nav-button active" : "nav-button"}
                title="Double-click to rename"
                onClick={() => onView(`list:${list.id}`)}
                onDoubleClick={() => startEdit(list)}
              >
                <span className="nav-slot" aria-hidden="true">
                  <svg className="list-mark" viewBox="0 0 16 16" style={{ color: list.color }}>
                    <path d="M3.2 4.6h9.6M3.2 8h9.6M3.2 11.4h6.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="nav-label">{list.name}</span>
                <i className="count-dot" style={{ background: list.color }} />
                {countFor(`list:${list.id}`) > 0 && <span className="nav-count">{countFor(`list:${list.id}`)}</span>}
              </button>
              <button type="button" className="nav-delete" aria-label={`Delete ${list.name}`} onClick={() => removeList(list)}>
                Delete
              </button>
            </div>
          ),
        )}
        {tags.length > 0 && <div className="group-label">Tags</div>}
        {tags.map((tag) => (
          <div key={tag.id} className="nav-item">
            <button
              className={view === `tag:${tag.id}` ? "nav-button active" : "nav-button"}
              onClick={() => onView(`tag:${tag.id}`)}
            >
              <span className="nav-slot" aria-hidden="true">
                <i className="dot" style={{ background: tag.color }} />
              </span>
              <span className="nav-label">{tag.name}</span>
            </button>
            <button type="button" className="nav-delete" aria-label={`Delete ${tag.name}`} onClick={() => removeTag(tag)}>
              Delete
            </button>
          </div>
        ))}
        <button type="button" className="nav-button" onClick={() => setArchivedOpen((open) => !open)}>
          <span className="nav-slot" aria-hidden="true">{archivedOpen ? "−" : "+"}</span>
          <span className="nav-label">Archived Lists</span>
        </button>
        {archivedOpen && archived.map((list) => (
          <button key={list.id} className="nav-button" onClick={() => onView(`list:${list.id}`)}>
            <span className="nav-label">{list.name}</span>
          </button>
        ))}
        <button type="button" className={view === "completed" ? "nav-button active" : "nav-button"} onClick={() => onView("completed")}>
          <span className="nav-label">Completed</span>
          <span className="nav-count">{data.tasks.filter((task) => matchesView(task, "completed", day)).length || ""}</span>
        </button>
        <button type="button" className={view === "trash" ? "nav-button active" : "nav-button"} onClick={() => onView("trash")}>
          <span className="nav-label">Trash</span>
        </button>
        {adding ? (
          <form className="list-edit" onSubmit={addList}>
            <input
              aria-label="New list"
              placeholder="List name"
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => { if (!draft.trim()) setAdding(false); }}
              onKeyDown={(event) => { if (event.key === "Escape") { setAdding(false); setDraft(""); } }}
            />
          </form>
        ) : (
          <button type="button" className="nav-button add-list" onClick={() => setAdding(true)}>
            <span className="nav-slot" aria-hidden="true">+</span>
            <span>Add list</span>
          </button>
        )}
      </div>
    </aside>
    </>
  );
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");

  useEffect(() => {
    const stored = localStorage.getItem("slate-theme");
    if (stored === "light" || stored === "dark" || stored === "system") setTheme(stored);
  }, []);

  function choose(next: "system" | "light" | "dark") {
    setTheme(next);
    localStorage.setItem("slate-theme", next);
    if (next === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  }

  const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
  const label = theme === "system" ? "Auto appearance" : theme === "light" ? "Light" : "Dark";
  const icon = theme === "light"
    ? "M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21"
    : "M20 14.5A7.5 7.5 0 0 1 9.5 4 7.5 7.5 0 1 0 20 14.5z";

  return (
    <button type="button" aria-label={label} title={label} onClick={() => choose(next)}>
      <NavIcon d={icon} />
    </button>
  );
}
