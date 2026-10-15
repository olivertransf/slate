"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, alive, formatDay, matchesView, parseDay, sortTasks, startOfWeek, taskOpen, formatTime, type ListRecord, type SortMode, type TaskRecord } from "@/lib/model";
import { taskToEvent } from "@/lib/google-client";
import { parseQuickAdd } from "@/lib/quick-add";
import { Board, type BoardGroup } from "./board";
import { Check } from "./check";
import { newId, stampTask, today, usePlanner } from "./planner-context";
import { TaskRow } from "./task-row";

export function TaskColumn({
  view,
  selectedId,
  onSelect,
  onLists,
  addOpen = false,
  onAddClose,
}: {
  view: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onLists?: () => void;
  addOpen?: boolean;
  onAddClose?: () => void;
}) {
  const { data, save, completeTask } = usePlanner();
  const [sectionName, setSectionName] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dropSection, setDropSection] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [layout, setLayout] = useState<"list" | "board">("list");
  const [group, setGroup] = useState<BoardGroup>("date");
  const [showCompleted, setShowCompleted] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [picked, setPicked] = useState<string[]>([]);
  const todayText = today();
  const list = view.startsWith("list:") ? data.lists.find((item) => item.id === view.slice(5)) : undefined;
  const title = list?.name ?? (view === "inbox" ? "Inbox" : view === "today" ? "Today" : view === "tomorrow" ? "Tomorrow" : view === "week" ? "Next 7 Days" : view === "overdue" ? "Overdue" : view === "completed" ? "Completed" : view === "trash" ? "Trash" : alive(data.tags).find((tag) => view === `tag:${tag.id}`)?.name ?? "Tagged");
  const open = sortTasks(data.tasks.filter((task) => matchesView(task, view, todayText)), sortMode);
  const done = data.tasks.filter((task) => completedInView(task, view, todayText)).sort((a, b) => a.sort - b.sort);
  const sections = list ? [...list.sections].sort((a, b) => a.sort - b.sort) : [];
  const lists = alive(data.lists).sort((a, b) => a.sort - b.sort);

  useEffect(() => {
    const storedLayout = localStorage.getItem("slate-layout");
    const storedGroup = localStorage.getItem("slate-board-group");
    if (storedLayout === "list" || storedLayout === "board") setLayout(storedLayout);
    if (storedGroup === "list" || storedGroup === "section" || storedGroup === "priority" || storedGroup === "date") {
      setGroup(storedGroup);
    }
    const storedCollapsed = localStorage.getItem("slate-collapsed-sections");
    if (storedCollapsed) {
      try {
        const parsed = JSON.parse(storedCollapsed) as unknown;
        if (Array.isArray(parsed)) setCollapsed(parsed.filter((item) => typeof item === "string"));
      } catch {
        setCollapsed([]);
      }
    }
  }, []);

  function chooseLayout(next: "list" | "board") {
    setLayout(next);
    localStorage.setItem("slate-layout", next);
  }

  useEffect(() => {
    if (!menuOpen) return;
    function close(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".more-menu")) return;
      setMenuOpen(false);
    }
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  function chooseGroup(next: BoardGroup) {
    setGroup(next);
    localStorage.setItem("slate-board-group", next);
  }

  function commitTitle() {
    if (!list) return;
    const name = titleDraft.trim();
    setEditingTitle(false);
    if (!name || name === list.name) return;
    save("lists", { ...list, name });
  }

  function addSection(event: React.FormEvent) {
    event.preventDefault();
    if (!list || !sectionName.trim()) return;
    const id = newId();
    save("lists", {
      ...list,
      sections: [...list.sections, { id, name: sectionName.trim(), sort: Date.now() }],
    });
    setSectionName("");
    setAddingSection(false);
    setActiveSection(id);
  }

  function renameSection(id: string) {
    if (!list) return;
    const name = renameValue.trim();
    setRenaming(null);
    if (!name) return;
    save("lists", {
      ...list,
      sections: list.sections.map((section) => (section.id === id ? { ...section, name } : section)),
    });
  }

  function removeSection(id: string) {
    if (!list) return;
    save("lists", { ...list, sections: list.sections.filter((section) => section.id !== id) });
    for (const task of data.tasks.filter((item) => item.sectionId === id && !item.deletedAt)) {
      save("tasks", { ...task, sectionId: null });
    }
    if (activeSection === id) setActiveSection(null);
  }

  function toggleCollapsed(id: string) {
    setCollapsed((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      localStorage.setItem("slate-collapsed-sections", JSON.stringify(next));
      return next;
    });
  }

  function moveToSection(taskId: string, sectionId: string | null) {
    const task = data.tasks.find((item) => item.id === taskId && !item.deletedAt);
    if (!task || !list || task.sectionId === sectionId) return;
    save("tasks", { ...task, listId: list.id, sectionId });
  }

  const groups = useMemo(() => {
    if (!list) return [{ id: "", name: "", tasks: open }];
    const unsectioned = open.filter((task) => !task.sectionId);
    return [
      { id: "", name: "", tasks: unsectioned },
      ...sections.map((section) => ({
        id: section.id,
        name: section.name,
        tasks: open.filter((task) => task.sectionId === section.id),
      })),
    ];
  }, [list, open, sections]);

  return (
    <section className="column">
      <header>
        <div className="title-row">
          {list ? (
            <i className="title-swatch" style={{ background: list.color }} />
          ) : (
            <svg className="title-glyph" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 4.2h10M3 8h10M3 11.8h10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          )}
          {list && editingTitle ? (
            <input
              className="list-title-input"
              aria-label="List name"
              value={titleDraft}
              autoFocus
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitTitle();
                if (event.key === "Escape") setEditingTitle(false);
              }}
            />
          ) : list ? (
            <button type="button" className="list-title" onClick={() => { setTitleDraft(list.name); setEditingTitle(true); }}>
              {title}
            </button>
          ) : (
            <h1>{title}</h1>
          )}
          <span className="count">{open.length}</span>
        </div>
        <div className="header-tools">
          <select aria-label="Sort" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="manual">Manual</option>
            <option value="date">Date</option>
            <option value="priority">Priority</option>
            <option value="title">Title</option>
          </select>
          {layout === "board" && (
            <select aria-label="Board columns" value={group} onChange={(event) => chooseGroup(event.target.value as BoardGroup)}>
              <option value="date">Date</option>
              <option value="list">Lists</option>
              <option value="section">Sections</option>
              <option value="priority">Priority</option>
            </select>
          )}
          {list && (
            <div className="more-menu">
              <button type="button" aria-label="List options" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h.01M8 8h.01M12.5 8h.01" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
              </button>
              {menuOpen && (
                <div className="more-pop" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setAddingSection(true); }}>Add section</button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); save("lists", { ...list, archivedAt: list.archivedAt ? null : new Date().toISOString() }); }}>
                    {list.archivedAt ? "Unarchive" : "Archive"}
                  </button>
                </div>
              )}
            </div>
          )}
          {done.length > 0 && (
            <button
              type="button"
              className={showCompleted ? "show-completed on" : "show-completed"}
              aria-pressed={showCompleted}
              onClick={() => setShowCompleted((value) => !value)}
            >
              <span className={showCompleted ? "switch on" : "switch"} aria-hidden="true" />
              Completed
              <span className="count">{done.length}</span>
            </button>
          )}
          <div className="view-switch" role="group" aria-label="Layout">
            <button type="button" className={layout === "list" ? "on" : ""} aria-label="List" onClick={() => chooseLayout("list")}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M3 8h10M3 11.5h10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
            </button>
            <button type="button" className={layout === "board" ? "on" : ""} aria-label="Board" onClick={() => chooseLayout("board")}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h3.2v9H3zM6.6 3.5h3.2v6H6.6zM10.2 3.5H13.4v7.5H10.2z" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
            </button>
          </div>
          {onLists && <button className="text-button lists-toggle" onClick={onLists}>Lists</button>}
        </div>
      </header>
      {addOpen && view !== "completed" && view !== "trash" && (
        <TaskAddSheet
          listId={list?.id ?? null}
          sectionId={list && activeSection ? activeSection : null}
          defaultDay={viewDay(view, todayText)}
          onClose={() => onAddClose?.()}
          onAdded={(task) => onSelect(task.id)}
        />
      )}
      {list && addingSection && (
        <form className="section-compose" onSubmit={addSection}>
          <input
            aria-label="Section name"
            placeholder="Section name"
            value={sectionName}
            autoFocus
            onChange={(event) => setSectionName(event.target.value)}
            onBlur={() => { if (!sectionName.trim()) setAddingSection(false); }}
            onKeyDown={(event) => { if (event.key === "Escape") { setAddingSection(false); setSectionName(""); } }}
          />
        </form>
      )}
      {picked.length > 0 && (
        <div className="bulk-bar">
          <span>{picked.length} selected</span>
          <button type="button" onClick={() => { for (const id of picked) { const task = data.tasks.find((item) => item.id === id); if (task) completeTask(task); } setPicked([]); }}>Complete</button>
          <button type="button" onClick={() => { for (const id of picked) { const task = data.tasks.find((item) => item.id === id); if (task) save("tasks", { ...task, deletedAt: new Date().toISOString() }); } setPicked([]); }}>Delete</button>
          <button type="button" onClick={() => setPicked([])}>Clear</button>
        </div>
      )}
      {layout === "board" ? (
        <Board
          tasks={showCompleted ? [...open, ...done] : open}
          lists={lists}
          group={group}
          today={todayText}
          list={list}
          selectedId={selectedId}
          onSelect={onSelect}
          onComplete={completeTask}
        />
      ) : (
      <div className="rows">
        {open.length === 0 && sections.length === 0 && done.length === 0 && <div className="empty"><p>Nothing here yet</p></div>}
        {groups.map((block) => (
          <div
            key={block.id || "none"}
            className={[
              "section-block",
              block.name ? "nested" : "",
              dropSection === (block.id || "none") ? "over" : "",
            ].filter(Boolean).join(" ")}
            onDragOver={list ? (event) => { event.preventDefault(); setDropSection(block.id || "none"); } : undefined}
            onDragLeave={list ? () => setDropSection((current) => (current === (block.id || "none") ? null : current)) : undefined}
            onDrop={list ? (event) => { event.preventDefault(); setDropSection(null); moveToSection(event.dataTransfer.getData("text/plain"), block.id || null); } : undefined}
          >
            {block.name && (
              <div className="section-head">
                <button type="button" className={collapsed.includes(block.id) ? "section-fold closed" : "section-fold"} aria-label="Collapse section" onClick={() => toggleCollapsed(block.id)}>
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5h7L8 11z" fill="currentColor" /></svg>
                </button>
                {renaming === block.id ? (
                  <input
                    aria-label="Section name"
                    value={renameValue}
                    autoFocus
                    onChange={(event) => setRenameValue(event.target.value)}
                    onBlur={() => renameSection(block.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") renameSection(block.id);
                      if (event.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="section-name"
                    onClick={() => { setRenaming(block.id); setRenameValue(block.name); }}
                  >
                    {block.name}
                  </button>
                )}
                <span className="count">{block.tasks.length}</span>
                <button type="button" className="section-remove" onClick={() => removeSection(block.id)} aria-label="Delete section">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                </button>
              </div>
            )}
            {!collapsed.includes(block.id) && (
              <div className="task-card">
                {block.tasks.map((task, index) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    draggable={Boolean(list)}
                    selected={task.id === selectedId || picked.includes(task.id)}
                    onSelect={() => onSelect(task.id)}
                    onComplete={() => completeTask(task)}
                    onDelete={() => save("tasks", view === "trash" ? { ...task, deletedAt: null } : { ...task, deletedAt: new Date().toISOString() })}
                    onReorder={() => {
                      const previous = block.tasks[index - 1];
                      if (!previous) return;
                      save("tasks", { ...task, sort: previous.sort - 1 });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        {showCompleted && done.length > 0 && <div className="section-title">Completed</div>}
        {showCompleted && done.map((task) => (
          <TaskRow key={task.id} task={task} selected={task.id === selectedId} onSelect={() => onSelect(task.id)} onComplete={() => completeTask(task)} />
        ))}
      </div>
      )}
    </section>
  );
}

function viewDay(view: string, day: string): string | null {
  if (view === "today" || view === "week") return day;
  if (view === "tomorrow") return addDays(day, 1);
  return null;
}

export function TaskAddSheet({
  listId = null,
  sectionId = null,
  defaultDay = null,
  onClose,
  onAdded,
}: {
  listId?: string | null;
  sectionId?: string | null;
  defaultDay?: string | null;
  onClose: () => void;
  onAdded?: (task: TaskRecord) => void;
}) {
  const { data, save } = usePlanner();
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState("");
  const todayText = today();
  const parsed = draft ? parseQuickAdd(draft, todayText) : null;
  const dueOn = parsed?.dueOn ?? defaultDay;
  const hint = [dueOn ? formatDay(dueOn, todayText) : "", parsed?.dueTime ? formatTime(parsed.dueTime) : ""].filter(Boolean).join(" · ");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!parsed?.title) return;
    const tagIds = parsed.tagNames.map((name) => {
      const existing = alive(data.tags).find((tag) => tag.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing.id;
      const tag = { id: newId(), name, color: "#8E4EC6", updatedAt: new Date().toISOString(), deletedAt: null };
      save("tags", tag);
      return tag.id;
    });
    const task = stampTask({
      title: parsed.title,
      listId,
      sectionId,
      notes,
      dueOn,
      dueTime: parsed.dueTime,
      priority: parsed.priority,
      repeat: parsed.repeat,
      tagIds,
    });
    save("tasks", task);
    setDraft("");
    setNotes("");
    onClose();
    onAdded?.(task);
  }

  return (
    <form className="add-sheet" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}>
      <button type="button" className="sheet-backdrop" aria-label="Close" onClick={onClose} />
      <div className="sheet-card" role="dialog" aria-modal="true" aria-label="New task">
        <input aria-label="Task" placeholder="What would you like to do?" value={draft} autoFocus onChange={(event) => setDraft(event.target.value)} />
        <textarea aria-label="Description" placeholder="Description" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        <div className="sheet-tools">
          <span className={dueOn ? "sheet-hint set" : "sheet-hint"}>{hint || "Tomorrow, 3pm, and #tags stay in the title"}</span>
          <button className="primary" type="submit" disabled={!parsed?.title}>Add</button>
        </div>
      </div>
    </form>
  );
}

const PRIORITY = ["No priority", "Low priority", "Medium priority", "High priority"] as const;

export function TaskDetail({ taskId, onClose, open = true }: { taskId: string | null; onClose: () => void; open?: boolean }) {
  const { data, save, completeTask } = usePlanner();
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<{ message: string; reconnect: boolean } | null>(null);
  useEffect(() => setConvertError(null), [taskId]);
  const task = data.tasks.find((item) => item.id === taskId && !item.deletedAt);
  if (!task) {
    return (
      <section className={open ? "detail" : "detail closed"}>
        <div className="empty"><p>Select a task</p></div>
      </section>
    );
  }
  const lists = alive(data.lists);
  const tags = alive(data.tags);
  const day = today();
  const list = lists.find((item) => item.id === task.listId);
  const sections = list?.sections ?? [];

  function patch(partial: Partial<TaskRecord>) {
    save("tasks", { ...task!, ...partial });
  }

  async function convert() {
    if (!task || converting) return;
    setConverting(true);
    setConvertError(null);
    const result = await taskToEvent(task, day);
    setConverting(false);
    if (!result.ok) {
      setConvertError({ message: result.error, reconnect: result.reconnect });
      return;
    }
    save("tasks", { ...task, deletedAt: new Date().toISOString() });
    onClose();
  }

  return (
    <section className={open ? "detail" : "detail closed"}>
      <div className="detail-bar">
        <button type="button" className="detail-icon" aria-label="Close" onClick={onClose}>
          <DetailIcon d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </button>
        <Check on={Boolean(task.completedAt)} onClick={() => completeTask(task)} />
        <span className="detail-split" />
        <label className={task.dueOn ? `detail-when ${task.dueOn < day ? "overdue" : "set"}` : "detail-when"}>
          <DetailIcon d="M2.5 5h11A1 1 0 0 1 14.5 6v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM1.5 8h13M5 3v3M11 3v3" />
          <span>{task.dueOn ? detailDate(task.dueOn, day) : "Date"}</span>
          <input type="date" aria-label="Date" value={task.dueOn ?? ""} onChange={(event) => patch({ dueOn: event.target.value || null })} />
        </label>
        <button
          type="button"
          className={`detail-icon priority-flag p${task.priority}`}
          aria-label={PRIORITY[task.priority]}
          title={PRIORITY[task.priority]}
          onClick={() => patch({ priority: ((task.priority + 1) % 4) as TaskRecord["priority"] })}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 2.5h7.2L9.4 5.6 11.2 8.7H4z" fill="currentColor" />
            <path d="M4 2.2v11.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="detail-body">
        <input className="title-input" aria-label="Title" value={task.title} onChange={(event) => patch({ title: event.target.value })} />
        <div className="detail-fields">
          <label className="detail-field">
            <DetailIcon d="M8 3.2v5l2.4 1.4M8 14.2a6.2 6.2 0 1 0 0-12.4 6.2 6.2 0 0 0 0 12.4z" />
            <span className="detail-value">
              <span className={task.dueTime ? "" : "placeholder"}>{task.dueTime ? formatTime(task.dueTime) : "Time"}</span>
              <input type="time" aria-label="Time" value={task.dueTime ?? ""} onChange={(event) => patch({ dueTime: event.target.value || null })} />
            </span>
          </label>
          <label className="detail-field">
            <DetailIcon d="M3 4.2h10M3 8h7" />
            <span className="detail-value">
              <span className={task.startOn ? "" : "placeholder"}>{task.startOn ?? "Start"}</span>
              <input type="date" aria-label="Start date" value={task.startOn ?? ""} onChange={(event) => patch({ startOn: event.target.value || null })} />
            </span>
          </label>
          <label className="detail-field">
            <DetailIcon d="M3 8.2a5 5 0 0 1 8.6-3.4L13 6.2M13 3.2v3h-3M13 7.8a5 5 0 0 1-8.6 3.4L3 9.8M3 12.8v-3h3" />
            <select
              className={task.repeat ? "" : "is-empty"}
              aria-label="Repeat"
              value={task.repeat?.unit ?? ""}
              onChange={(event) => patch({ repeat: event.target.value ? { every: task.repeat?.every ?? 1, unit: event.target.value as "day" | "week" | "month" | "year", weekdays: task.repeat?.weekdays } : null })}
            >
              <option value="">Repeat</option>
              <option value="day">Every day</option>
              <option value="week">Every week</option>
              <option value="month">Every month</option>
              <option value="year">Every year</option>
            </select>
            {task.repeat && (
              <input
                type="number"
                min={1}
                max={99}
                aria-label="Repeat interval"
                value={task.repeat.every}
                onChange={(event) => patch({ repeat: { ...task.repeat!, every: Math.max(1, Number(event.target.value) || 1) } })}
              />
            )}
            {task.repeat?.unit === "week" && (
              <div className="weekday-picks" role="group" aria-label="Weekdays">
                {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
                  <button
                    key={`${label}-${index}`}
                    type="button"
                    className={task.repeat?.weekdays?.includes(index) ? "on" : ""}
                    aria-pressed={task.repeat?.weekdays?.includes(index) ?? false}
                    onClick={() => {
                      const current = task.repeat?.weekdays ?? [];
                      const weekdays = current.includes(index) ? current.filter((day) => day !== index) : [...current, index].sort();
                      patch({ repeat: { ...task.repeat!, weekdays } });
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </label>
          <label className="detail-field">
            <DetailIcon d="M8 2.6a2.6 2.6 0 0 1 2.6 2.6v1.2l.7 1.4H4.7l.7-1.4V5.2A2.6 2.6 0 0 1 8 2.6zM6.8 9.6a1.2 1.2 0 0 0 2.4 0" />
            <select
              className={task.remindMinutesBefore == null ? "is-empty" : ""}
              aria-label="Reminder"
              value={task.remindMinutesBefore ?? ""}
              onChange={(event) => patch({ remindMinutesBefore: event.target.value === "" ? null : Number(event.target.value) })}
            >
              <option value="">Reminder</option>
              <option value="0">At the time</option>
              <option value="15">15 minutes before</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
            </select>
          </label>
          {sections.length > 0 && (
            <label className="detail-field">
              <DetailIcon d="M3 4.2h10M3 8h10M3 11.8h10" />
              <select
                className={task.sectionId ? "" : "is-empty"}
                aria-label="Section"
                value={task.sectionId ?? ""}
                onChange={(event) => patch({ sectionId: event.target.value || null })}
              >
                <option value="">Section</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>{section.name}</option>
                ))}
              </select>
            </label>
          )}
          <div className="detail-field">
            <DetailIcon d="M3.2 8.4 6.4 3.2h6.2v5.2L8.2 12.8 3.2 8.4zM10.4 5.6h.01" />
            <div className="chips">
              {tags.length === 0 && <span className="placeholder">Tags</span>}
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={task.tagIds.includes(tag.id) ? "chip on" : "chip"}
                  onClick={() => patch({ tagIds: task.tagIds.includes(tag.id) ? task.tagIds.filter((id) => id !== tag.id) : [...task.tagIds, tag.id] })}
                >
                  <i className="dot" style={{ background: tag.color }} />
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="detail-subs">
          {task.subtasks.map((subtask) => (
            <div className="subtask" key={subtask.id}>
              <Check on={subtask.done} label="Subtask" onClick={() => patch({ subtasks: task.subtasks.map((item) => item.id === subtask.id ? { ...item, done: !item.done } : item) })} />
              <input
                value={subtask.title}
                aria-label="Subtask"
                placeholder="Subtask"
                onChange={(event) => patch({ subtasks: task.subtasks.map((item) => item.id === subtask.id ? { ...item, title: event.target.value } : item) })}
              />
            </div>
          ))}
          <button type="button" className="detail-add" onClick={() => patch({ subtasks: [...task.subtasks, { id: newId(), title: "", done: false }] })}>
            <span aria-hidden="true">+</span>
            <span>Add subtask</span>
          </button>
        </div>
        <textarea className="detail-notes" aria-label="Notes" placeholder="Description" value={task.notes} onChange={(event) => patch({ notes: event.target.value })} />
        {convertError && (
          <p className="detail-error" role="alert">
            {convertError.message}
            {convertError.reconnect && <> <a href="/api/google/start">Reconnect</a></>}
          </p>
        )}
      </div>
      <footer className="detail-foot">
        <label className="detail-list">
          {list ? <i className="title-swatch" style={{ background: list.color }} /> : <DetailIcon d="M3 8.5h2.4l.6-1.2h3.8l.6 1.2H13M3.6 8.5v2.6c0 .5.4.9.9.9h7c.5 0 .9-.4.9-.9V8.5" />}
          <select
            aria-label="List"
            value={task.listId ?? ""}
            onChange={(event) => patch({ listId: event.target.value || null, sectionId: null })}
          >
            <option value="">Inbox</option>
            {lists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <button
          type="button"
          className="detail-convert"
          disabled={converting}
          title={task.dueOn ? "Create a Google Calendar event and move this task to Trash" : "Create a Google Calendar event today and move this task to Trash"}
          onClick={() => void convert()}
        >
          <DetailIcon d="M2.5 5h11A1 1 0 0 1 14.5 6v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM1.5 8h13M5 3v3M11 3v3" />
          <span>{converting ? "Converting" : "Make event"}</span>
        </button>
        <button
          type="button"
          className="detail-icon"
          aria-label="Delete task"
          onClick={() => { save("tasks", { ...task, deletedAt: new Date().toISOString() }); onClose(); }}
        >
          <DetailIcon d="M3.5 5h9M6 5V3.8h4V5M6.2 5.2l.4 7.2h2.8l.4-7.2" />
        </button>
      </footer>
    </section>
  );
}

function detailDate(value: string, day: string): string {
  if (value === day) return "Today";
  if (value === addDays(day, 1)) return "Tomorrow";
  if (value === addDays(day, -1)) return "Yesterday";
  const date = parseDay(value);
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  const monthDay = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const weekStart = startOfWeek(day);
  if (value >= addDays(weekStart, 7) && value <= addDays(weekStart, 13)) return `Next ${weekday}, ${monthDay}`;
  if (date.getFullYear() !== parseDay(day).getFullYear()) return `${weekday}, ${monthDay}, ${date.getFullYear()}`;
  return `${weekday}, ${monthDay}`;
}

function DetailIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function completedInView(task: TaskRecord, view: string, day: string): boolean {
  if (task.deletedAt || !task.completedAt) return false;
  if (view === "inbox") return task.listId == null;
  if (view === "today") return task.dueOn != null && task.dueOn <= day;
  if (view === "tomorrow") return task.dueOn === addDays(day, 1);
  if (view === "week") return task.dueOn != null && task.dueOn <= addDays(day, 6);
  if (view.startsWith("list:")) return task.listId === view.slice(5);
  if (view.startsWith("tag:")) return task.tagIds.includes(view.slice(4));
  return false;
}

export function listRecord(lists: ListRecord[], id: string | null): ListRecord | undefined {
  return lists.find((list) => list.id === id);
}

export function openTasks(tasks: TaskRecord[]): TaskRecord[] {
  return tasks.filter(taskOpen);
}
