"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, alive, formatDay, matchesView, nextTaskDue, parseDay, searchTasks, sortTasks, startOfWeek, taskOpen, upcomingDay, visibleLists, formatTime, type ListRecord, type SortMode, type TaskRecord } from "@/lib/model";
import { taskToEvent } from "@/lib/google-client";
import { parseQuickAdd, tokenLabel } from "@/lib/quick-add";
import { ActionMenu, type ActionItem } from "./action-menu";
import { AddSheet } from "./add-sheet";
import { Board, type BoardGroup } from "./board";
import { Check } from "./check";
import { newId, stampTask, today, usePlanner } from "./planner-context";
import { DEFAULT_FILTER, SearchFilters, matchesFilter } from "./search-filters";
import { QuickAddBox } from "./quick-add-box";
import { ReferenceIcon, CompletedArtwork } from "./reference-icon";
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
  const { data, save, saveBatch, completeTask, completeTasks } = usePlanner();
  const [quickDraft, setQuickDraft] = useState("");
  const [ignoredQuickTokens, setIgnoredQuickTokens] = useState<string[]>([]);
  const [sectionName, setSectionName] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dropSection, setDropSection] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [layout, setLayout] = useState<"list" | "board">("list");
  const [group, setGroup] = useState<BoardGroup>("date");
  const [showCompleted, setShowCompleted] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [picked, setPicked] = useState<string[]>([]);
  const [bulkDate, setBulkDate] = useState("");
  const selectedTasks = data.tasks.filter((task) => picked.includes(task.id) && !task.deletedAt);
  function editSelected(patch: Partial<TaskRecord>) {
    saveBatch(selectedTasks.map((task) => ({ kind: "tasks", record: { ...task, ...patch } })));
    setPicked([]);
  }
  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const canAdd = view !== "completed" && view !== "trash";
  const todayText = today();
  const list = view.startsWith("list:") ? data.lists.find((item) => item.id === view.slice(5)) : undefined;
  const title = list?.name ?? (view.startsWith("date:") ? formatDay(view.slice(5), todayText) : view === "search" ? "Search" : view === "upcoming" ? "Upcoming" : view === "anytime" ? "Anytime" : view === "someday" ? "Someday" : view === "inbox" ? "Inbox" : view === "today" ? "Today" : view === "tomorrow" ? "Tomorrow" : view === "week" ? "Next 7 Days" : view === "overdue" ? "Overdue" : view === "completed" ? "Completed" : view === "trash" ? "Trash" : alive(data.tags).find((tag) => view === `tag:${tag.id}`)?.name ?? "Tagged");
  const activeListIds = new Set(visibleLists(data.lists).map((item) => item.id));
  const inActiveList = (task: TaskRecord) => task.listId == null || activeListIds.has(task.listId);
  const open = view === "search"
    ? searchTasks(data.tasks.filter((task) => !task.deletedAt && inActiveList(task) && matchesFilter(task, filter, todayText)), filter.query)
    : sortTasks(data.tasks.filter((task) => (
      (!(view === "upcoming" || view === "anytime" || view === "someday") || inActiveList(task)) && matchesView(task, view, todayText)
    )), sortMode);
  const recurringHistory = view === "completed" ? data.tasks.flatMap((task) => task.deletedAt ? [] : (
    task.repeatHistory ?? []
  ).map((occurrence) => ({ task, ...occurrence }))).sort((a, b) => b.completedAt.localeCompare(a.completedAt)) : [];
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

  function addInline(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseQuickAdd(quickDraft, todayText, ignoredQuickTokens);
    if (!parsed.title.trim() || parsed.title.length > 500) return;
    const newTags = parsed.tagNames.filter((name) => !alive(data.tags).some((tag) => tag.name.toLowerCase() === name.toLowerCase()))
      .map((name) => ({ id: newId(), name, color: "#8c5efa", updatedAt: new Date().toISOString(), deletedAt: null }));
    const tagIds = parsed.tagNames.map((name) => [...alive(data.tags), ...newTags].find((tag) => tag.name.toLowerCase() === name.toLowerCase())!.id);
    const task = stampTask({ title: parsed.title, listId: list?.id ?? null, sectionId: list?.sections.some((section) => section.id === activeSection) ? activeSection : null,
      dueOn: parsed.dueOn ?? viewDay(view, todayText), dueTime: parsed.dueTime,
      priority: parsed.priority, repeat: parsed.repeat, tagIds, someday: view === "someday" });
    saveBatch([...newTags.map((record) => ({ kind: "tags" as const, record })), { kind: "tasks", record: task }]);
    setQuickDraft("");
    setIgnoredQuickTokens([]);
  }

  function chooseLayout(next: "list" | "board") {
    setLayout(next);
    localStorage.setItem("slate-layout", next);
  }


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
    if (view === "upcoming") {
      const byDay = new Map<string, TaskRecord[]>();
      for (const task of open) {
        const date = upcomingDay(task, todayText);
        if (!date) continue;
        const tasks = byDay.get(date);
        if (tasks) tasks.push(task);
        else byDay.set(date, [task]);
      }
      return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([id, tasks]) => ({
        id, name: formatDay(id, todayText), tasks,
      }));
    }
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
  }, [list, open, sections, todayText, view]);

  return (
    <section className="column">
      <header>
        <div className="title-row">
          {onLists && (
            <button type="button" className="lists-toggle" aria-label="Lists" onClick={onLists}>
              <ReferenceIcon name="sidebar-collapse" />
            </button>
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
          <span className="count">{open.length + recurringHistory.length}</span>
        </div>
        <div className="reference-tools">
          <ActionMenu label="Sort tasks" icon={<ReferenceIcon name="sort" />} items={(["manual", "date", "priority", "title"] as const).map((mode) => ({ label: { manual: "Manual", date: "Date", priority: "Priority", title: "Title" }[mode], checked: sortMode === mode, action: () => setSortMode(mode) }))} />
          <ActionMenu label="View options" icon={<ReferenceIcon name="more-titlebar" />} items={[
            { label: "List view", checked: layout === "list", action: () => chooseLayout("list") },
            { label: "Board view", checked: layout === "board", action: () => chooseLayout("board") },
            ...(layout === "board" ? [{ label: "Group by", children: (["date", "list", "section", "priority"] as const).map((next) => ({ label: { date: "Date", list: "List", section: "Section", priority: "Priority" }[next], checked: group === next, action: () => chooseGroup(next) })) }] : []),
            { label: "Show completed", checked: showCompleted, divider: true, action: () => setShowCompleted((value) => !value) },
            ...(list ? [
              { label: "Add section", divider: true, action: () => setAddingSection(true) },
              { label: "Project settings", action: () => setEditingProject(list.id) },
              { label: list.favorite ? "Remove from favorites" : "Add to favorites", action: () => save("lists", { ...list, favorite: !list.favorite }) },
              { label: list.archivedAt ? "Unarchive list" : "Archive list", action: () => save("lists", { ...list, archivedAt: list.archivedAt ? null : new Date().toISOString() }) },
            ] : []),
          ] satisfies ActionItem[]} />
        </div>
      </header>
      {view !== "completed" && view !== "trash" && view !== "search" && (
        <div className="desktop-quick"><QuickAddBox value={quickDraft} onChange={setQuickDraft} onSubmit={addInline} today={todayText} ignored={ignoredQuickTokens} onIgnoredChange={setIgnoredQuickTokens} /></div>
      )}
      {list?.description && <p className="project-description">{list.description}</p>}
      {list && editingProject === list.id && (
        <form key={list.id} className="task-search-controls" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          save("lists", { ...list, area: String(form.get("area") ?? "").trim(), description: String(form.get("description") ?? "").trim() });
          setEditingProject(null);
        }}>
          <label>Area <input name="area" defaultValue={list.area ?? ""} maxLength={80} placeholder="e.g. Work" /></label>
          <label>Description <textarea name="description" defaultValue={list.description ?? ""} maxLength={2000} rows={2} /></label>
          <button className="text-button">Save</button>
          <button className="text-button" type="button" onClick={() => setEditingProject(null)}>Cancel</button>
        </form>
      )}
      {view === "search" && (
        <SearchFilters value={filter} onChange={setFilter} lists={visibleLists(data.lists)} tags={alive(data.tags)} />
      )}
      {addOpen && canAdd && (
        <TaskAddSheet
          listId={list?.id ?? null}
          sectionId={list && activeSection ? activeSection : null}
          defaultDay={viewDay(view, todayText)}
          someday={view === "someday"}
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
          <span>{selectedTasks.length} selected</span>
          <button type="button" onClick={() => { completeTasks(selectedTasks.filter((task) => !task.completedAt)); setPicked([]); }}>Complete</button>
          <button type="button" onClick={() => editSelected({ deletedAt: new Date().toISOString() })}>Delete</button>
          <select aria-label="Move selected tasks" value="choose" onChange={(event) => editSelected({ listId: event.target.value || null, sectionId: null })}>
            <option value="choose" disabled>Move to…</option>
            <option value="">Inbox</option>
            {visibleLists(lists).map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}
          </select>
          <input type="date" aria-label="Planned date for selected tasks" value={bulkDate} onChange={(event) => setBulkDate(event.target.value)} />
          <button type="button" disabled={!bulkDate} onClick={() => editSelected({ startOn: bulkDate })}>Plan</button>
          <button type="button" onClick={() => setPicked([])}>Clear</button>
        </div>
      )}
      {recurringHistory.length > 0 && (
        <div className="repeat-history">
          <h2 className="section-title">Recurring completions</h2>
          {recurringHistory.map(({ task, dueOn, completedAt }) => (
            <button key={`${task.id}:${dueOn}`} type="button" className="settings-row" onClick={() => onSelect(task.id)}>
              <span>{task.title}</span>
              <span>{new Date(completedAt).toLocaleDateString()} · Due {formatDay(dueOn, todayText)}</span>
            </button>
          ))}
        </div>
      )}
      {layout === "board" && view !== "completed" && view !== "trash" ? (
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
        {open.length === 0 && sections.length === 0 && (!showCompleted || done.length === 0) && recurringHistory.length === 0 && <div className="empty task-empty">
          <CompletedArtwork />
          <p>{view === "search" ? "No matching tasks" : view === "trash" ? "Trash is empty" : view === "completed" ? "No completed tasks yet" : "No tasks here yet"}</p>
          {view === "search" && <button type="button" className="text-button" onClick={() => setFilter(DEFAULT_FILTER)}>Clear search and filters</button>}
        </div>}
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
                <button type="button" className={collapsed.includes(block.id) ? "section-fold closed" : "section-fold"} aria-expanded={!collapsed.includes(block.id)} aria-label={block.name} onClick={() => toggleCollapsed(block.id)}>
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5h7L8 11z" fill="currentColor" /></svg>
                </button>
                {!list ? <span className="section-name">{block.name}</span> : renaming === block.id ? (
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
                {list && <button type="button" className="section-remove" onClick={() => removeSection(block.id)} aria-label="Delete section">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                </button>}
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
  if (view.startsWith("date:")) return view.slice(5);
  if (view === "today" || view === "week") return day;
  if (view === "tomorrow") return addDays(day, 1);
  return null;
}

export function TaskAddSheet({
  listId = null,
  sectionId = null,
  defaultDay = null,
  someday = false,
  onClose,
  onAdded,
}: {
  listId?: string | null;
  sectionId?: string | null;
  defaultDay?: string | null;
  someday?: boolean;
  onClose: () => void;
  onAdded?: (task: TaskRecord) => void;
}) {
  const { data, saveBatch } = usePlanner();
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState("");
  const [ignored, setIgnored] = useState<string[]>([]);
  const [keepOpen, setKeepOpen] = useState(false);
  const todayText = today();
  const parsed = draft ? parseQuickAdd(draft, todayText, ignored) : null;
  const dueOn = parsed?.dueOn ?? defaultDay;
  const hint = [dueOn ? formatDay(dueOn, todayText) : "", parsed?.dueTime ? formatTime(parsed.dueTime) : ""].filter(Boolean).join(" · ");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed?.title || parsed.title.length > 500) return;
    const tags = alive(data.tags);
    const newTags = parsed.tagNames.filter((name) => !tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase()))
      .map((name) => ({ id: newId(), name, color: "#8c5efa", updatedAt: new Date().toISOString(), deletedAt: null }));
    const tagIds = parsed.tagNames.map((name) => [...tags, ...newTags].find((tag) => tag.name.toLowerCase() === name.toLowerCase())!.id);
    const task = stampTask({
      title: parsed.title,
      listId,
      sectionId,
      notes,
      dueOn,
      dueTime: parsed.dueTime,
      priority: parsed.priority,
      repeat: parsed.repeat,
      someday,
      tagIds,
    });
    saveBatch([...newTags.map((record) => ({ kind: "tags" as const, record })), { kind: "tasks", record: task }]);
    setDraft("");
    setNotes("");
    setIgnored([]);
    if (keepOpen) {
      event.currentTarget.querySelector<HTMLInputElement>("input")?.focus();
      return;
    }
    onClose();
    onAdded?.(task);
  }

  return (
    <AddSheet label="New task" onClose={onClose} onSubmit={submit}>
        <input aria-label="Task" placeholder="What would you like to do?" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <textarea aria-label="Description" placeholder="Write something…" rows={2} maxLength={200000} value={notes} onChange={(event) => setNotes(event.target.value)} />
        {!!parsed?.tokens.length && (
          <div className="capture-tokens" aria-label="Interpreted task details">
            {parsed.tokens.map((token) => (
              <button type="button" key={token.start} aria-label={`Keep "${token.text}" in the title`} onClick={() => setIgnored([...ignored, token.text])}>
                {tokenLabel(token, todayText)} ×
              </button>
            ))}
          </div>
        )}
        <label className="check-row">
          <input type="checkbox" checked={keepOpen} onChange={(event) => setKeepOpen(event.target.checked)} /> Keep open after adding
        </label>
        <div className="sheet-tools">
          <span className={dueOn ? "sheet-hint set" : "sheet-hint"}>{hint || "Try tomorrow, 3pm, or #tag"}</span>
          <button className="primary" type="submit" disabled={!parsed?.title || parsed.title.length > 500}>Add task</button>
        </div>
    </AddSheet>
  );
}

const PRIORITY = ["No priority", "Low priority", "Medium priority", "High priority"] as const;

export function TaskDetail({ taskId, onClose, open = true }: { taskId: string | null; onClose: () => void; open?: boolean }) {
  const { data, save, completeTask } = usePlanner();
  const [converting, setConverting] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [convertError, setConvertError] = useState<{ message: string; reconnect: boolean } | null>(null);
  useEffect(() => setConvertError(null), [taskId]);
  const task = data.tasks.find((item) => item.id === taskId);
  if (!task) {
    return (
      <section aria-label="Task details" className={open ? "detail" : "detail closed"}>
        <DetailBackdrop />
      </section>
    );
  }
  if (task.deletedAt) {
    return (
      <section className="detail" aria-label="Deleted task details">
        <div className="detail-bar">
          <button type="button" className="detail-icon detail-close" aria-label="Close" onClick={onClose}>
            <DetailIcon d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </button>
          <button type="button" className="text-button" onClick={() => {
            save("tasks", { ...task, deletedAt: null });
            onClose();
          }}>Restore {task.kind === "note" ? "note" : "task"}</button>
        </div>
        <div className="detail-body deleted-detail">
          <h2>{task.title}</h2>
          {task.notes && <p>{task.notes}</p>}
        </div>
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
    <section aria-label="Task details" className={open ? "detail" : "detail closed"}>
      <div className="detail-bar">
        <button type="button" className="detail-icon detail-close" aria-label="Close" onClick={onClose}>
          <DetailIcon d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </button>
        {task.kind !== "note" && <Check on={Boolean(task.completedAt)} onClick={() => completeTask(task)} />}
        <span className="detail-split" />
        <label className={task.dueOn ? `detail-when ${task.dueOn < day ? "overdue" : "set"}` : "detail-when"}>
          <DetailIcon d="M2.5 5h11A1 1 0 0 1 14.5 6v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM1.5 8h13M5 3v3M11 3v3" />
          <span>{task.dueOn ? detailDate(task.dueOn, day) : "Due Date"}</span>
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
        <input className="title-input" aria-label="Title" maxLength={500} value={titleDraft ?? task.title}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={(event) => {
            const title = event.currentTarget.value.trim();
            if (title && title !== task.title) patch({ title });
            setTitleDraft(null);
          }} />
        <div className="detail-subs">
          {task.subtasks.map((subtask) => (
            <div className="subtask" key={subtask.id}>
              <Check on={subtask.done} label="Subtask" onClick={() => patch({ subtasks: task.subtasks.map((item) => item.id === subtask.id ? { ...item, done: !item.done } : item) })} />
              <input
                value={subtask.title}
                aria-label="Subtask"
                maxLength={500}
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
        <textarea className="detail-notes" aria-label="Notes" placeholder="Write something…" maxLength={200000} value={task.notes} onChange={(event) => patch({ notes: event.target.value })} />
        <details className="task-properties" key={task.id}>
          <summary>Task options <span aria-hidden="true">···</span></summary>
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
                <input type="date" aria-label="Start date" value={task.startOn ?? ""} onChange={(event) => patch(event.target.value ? { startOn: event.target.value, someday: false } : { startOn: null, startTime: null })} />
              </span>
            </label>
            <label className="detail-field">
              <span>Planned time</span>
              <input type="time" aria-label="Planned time" disabled={!task.startOn} value={task.startTime ?? ""} onChange={(event) => patch({ startTime: event.target.value || null })} />
            </label>
            {task.startOn && task.startTime && (
              <label className="detail-field">
                <span>Duration in minutes</span>
                <input type="number" min={1} max={1440} aria-label="Planned duration" value={task.durationMinutes ?? ""} placeholder="60" onChange={(event) => {
                  const minutes = event.target.valueAsNumber;
                  patch({ durationMinutes: Number.isFinite(minutes) ? Math.min(1440, Math.max(1, Math.round(minutes))) : null });
                }} />
              </label>
            )}
            <label className="detail-field">
              <input type="checkbox" checked={task.someday ?? false} onChange={(event) => patch({ someday: event.target.checked })} />
              <span>Someday</span>
            </label>
            {task.someday && (task.dueOn || task.remindMinutesBefore != null) && <p className="hint">Existing deadlines and reminders still apply.</p>}
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
                  onChange={(event) => patch({ repeat: { ...task.repeat!, every: Math.min(99, Math.max(1, Math.round(event.target.valueAsNumber) || 1)) } })}
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
            {task.repeat && (
              <>
                <label className="detail-field">
                  <span>Repeat from</span>
                  <select aria-label="Repeat from" value={task.repeatAfterCompletion ? "completion" : "schedule"} onChange={(event) => patch({ repeatAfterCompletion: event.target.value === "completion" })}>
                    <option value="schedule">Scheduled date</option>
                    <option value="completion">Completion date</option>
                  </select>
                </label>
                <label className="detail-field">
                  <span>Repeat until</span>
                  <input type="date" aria-label="Repeat until" value={task.repeatUntil ?? ""} onChange={(event) => patch({ repeatUntil: event.target.value || null })} />
                </label>
                {task.dueOn && <p className="hint">{(() => {
                  const next = nextTaskDue(task, day);
                  return next ? `Next if completed today: ${formatDay(next, day)}` : "No further occurrences";
                })()}</p>}
              </>
            )}
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
        </details>
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

function DetailBackdrop() {
  return <svg className="detail-backdrop" viewBox="0 0 600 900" fill="none" aria-hidden="true">
    <defs><pattern id="detail-stars" width="150" height="180" patternUnits="userSpaceOnUse"><path d="m38 32 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="currentColor" stroke="none" /><circle cx="112" cy="125" r="3" fill="currentColor" /></pattern></defs>
    <rect width="600" height="900" fill="url(#detail-stars)" />
    <g transform="translate(120 610) rotate(-22 170 110)" stroke="currentColor" strokeWidth="1.5">
      <rect x="65" y="60" width="245" height="160" rx="8" /><rect x="76" y="72" width="223" height="136" rx="3" />
      <path d="M102 103h145M102 123h170M102 143h117M102 163h150M102 183h90" />
      <rect x="160" y="4" width="155" height="33" rx="4" /><path d="m171 17 4 5 8-10M194 20h103" />
      <circle cx="33" cy="150" r="29" /><circle cx="33" cy="150" r="22" /><path d="M33 135v16l10 6M15 123l-9-10M50 123l9-10" />
      <path d="m335 114 8-15 8 15v122h-16ZM335 122h16M337 230h12" />
      <path d="M113 37V4h34v33ZM122 18h.1M138 18h.1M123 26q7 7 14 0" />
    </g>
  </svg>;
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
  if (view === "today") return matchesView({ ...task, completedAt: null }, view, day);
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
