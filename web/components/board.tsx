"use client";

import { useState } from "react";
import { addDays, alive, type ListRecord, type TaskRecord } from "@/lib/model";
import { newId, usePlanner } from "./planner-context";
import { TaskRow } from "./task-row";

export type BoardGroup = "list" | "section" | "priority" | "date";

type Column = {
  id: string;
  title: string;
  tasks: TaskRecord[];
  rename: "list" | "section" | null;
};

export function Board({
  tasks,
  lists,
  group,
  today,
  list,
  selectedId,
  onSelect,
  onComplete,
}: {
  tasks: TaskRecord[];
  lists: ListRecord[];
  group: BoardGroup;
  today: string;
  list: ListRecord | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onComplete: (task: TaskRecord) => void;
}) {
  const { save } = usePlanner();
  const [over, setOver] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState("");
  const columns = buildColumns(tasks, lists, group, today, list);

  function drop(columnId: string, taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const next = moved(task, columnId, group, today, lists);
    if (next) save("tasks", next);
  }

  function commitRename(column: Column) {
    const name = title.trim();
    setEditing(null);
    if (!name || name === column.title) return;
    if (column.rename === "list") {
      const target = lists.find((item) => item.id === column.id);
      if (target) save("lists", { ...target, name });
    }
    if (column.rename === "section") {
      const owner = lists.find((item) => item.sections.some((section) => section.id === column.id));
      if (!owner) return;
      save("lists", {
        ...owner,
        sections: owner.sections.map((section) => (section.id === column.id ? { ...section, name } : section)),
      });
    }
  }

  function addColumn(event: React.FormEvent) {
    event.preventDefault();
    const name = adding.trim();
    if (!name) return;
    if (group === "list") {
      save("lists", {
        id: newId(),
        name,
        color: ["#4C6FFF", "#22A06B", "#E5484D", "#F5A524", "#8E4EC6"][lists.length % 5] ?? "#4C6FFF",
        sort: Date.now(),
        sections: [],
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });
    }
    if (group === "section" && list) {
      save("lists", {
        ...list,
        sections: [...list.sections, { id: newId(), name, sort: Date.now() }],
      });
    }
    setAdding("");
  }

  const canAdd = group === "list" || (group === "section" && Boolean(list));

  return (
    <div className="board">
      {columns.map((column) => (
        <section
          key={column.id || "none"}
          className={over === column.id ? "board-col over" : "board-col"}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(column.id);
          }}
          onDragLeave={() => setOver((current) => (current === column.id ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            setOver(null);
            drop(column.id, event.dataTransfer.getData("text/plain"));
          }}
        >
          <header>
            {editing === column.id ? (
              <input
                aria-label="Column name"
                value={title}
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
                onBlur={() => commitRename(column)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename(column);
                  if (event.key === "Escape") setEditing(null);
                }}
              />
            ) : column.rename ? (
              <button
                className="board-title"
                type="button"
                onClick={() => {
                  setEditing(column.id);
                  setTitle(column.title);
                }}
              >
                {column.title}
              </button>
            ) : (
              <h2 className="board-title">{column.title}</h2>
            )}
            <span className="count">{column.tasks.length}</span>
          </header>
          <div className="board-scroll">
            {column.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                draggable
                selected={task.id === selectedId}
                onSelect={() => onSelect(task.id)}
                onComplete={() => onComplete(task)}
              />
            ))}
          </div>
        </section>
      ))}
      {canAdd && (
        <form className="board-add" onSubmit={addColumn}>
          <input
            aria-label={group === "list" ? "New list" : "New column"}
            placeholder={group === "list" ? "New list" : "New column"}
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
          />
        </form>
      )}
    </div>
  );
}

function buildColumns(
  tasks: TaskRecord[],
  lists: ListRecord[],
  group: BoardGroup,
  today: string,
  list: ListRecord | undefined,
): Column[] {
  if (group === "list") {
    return [
      { id: "", title: "Inbox", tasks: tasks.filter((task) => task.listId == null), rename: null },
      ...lists.map((item) => ({
        id: item.id,
        title: item.name,
        tasks: tasks.filter((task) => task.listId === item.id),
        rename: "list" as const,
      })),
    ];
  }
  if (group === "section") {
    const source = list ? [list] : lists;
    return [
      {
        id: "",
        title: "No section",
        tasks: tasks.filter((task) => !task.sectionId && (!list || task.listId === list.id)),
        rename: null,
      },
      ...source.flatMap((item) =>
        [...item.sections]
          .sort((a, b) => a.sort - b.sort)
          .map((section) => ({
            id: section.id,
            title: list ? section.name : `${item.name} · ${section.name}`,
            tasks: tasks.filter((task) => task.sectionId === section.id),
            rename: "section" as const,
          })),
      ),
    ];
  }
  if (group === "priority") {
    const names = ["None", "Low", "Medium", "High"] as const;
    return names.map((name, index) => ({
      id: String(index),
      title: name,
      tasks: tasks.filter((task) => task.priority === index),
      rename: null,
    }));
  }
  const buckets = [
    ["overdue", "Overdue"],
    ["today", "Today"],
    ["tomorrow", "Tomorrow"],
    ["week", "This week"],
    ["later", "Later"],
    ["none", "No date"],
  ] as const;
  return buckets.map(([id, title]) => ({
    id,
    title,
    tasks: tasks.filter((task) => dateBucket(task, today) === id),
    rename: null,
  }));
}

function dateBucket(task: TaskRecord, today: string): string {
  if (!task.dueOn) return "none";
  if (task.dueOn < today) return "overdue";
  if (task.dueOn === today) return "today";
  if (task.dueOn === addDays(today, 1)) return "tomorrow";
  if (task.dueOn <= addDays(today, 6)) return "week";
  return "later";
}

function moved(task: TaskRecord, columnId: string, group: BoardGroup, today: string, lists: ListRecord[]): TaskRecord | null {
  if (group === "list") {
    const listId = columnId || null;
    if (task.listId === listId) return null;
    return { ...task, listId, sectionId: null };
  }
  if (group === "section") {
    const sectionId = columnId || null;
    if (task.sectionId === sectionId) return null;
    const owner = lists.find((item) => item.sections.some((section) => section.id === columnId));
    return { ...task, sectionId, listId: owner?.id ?? task.listId };
  }
  if (group === "priority") {
    const priority = Number(columnId) as TaskRecord["priority"];
    if (task.priority === priority) return null;
    return { ...task, priority };
  }
  const dueOn = dueFor(columnId, today);
  if ((task.dueOn ?? null) === dueOn) return null;
  return { ...task, dueOn };
}

function dueFor(columnId: string, today: string): string | null {
  if (columnId === "overdue") return addDays(today, -1);
  if (columnId === "today") return today;
  if (columnId === "tomorrow") return addDays(today, 1);
  if (columnId === "week") return addDays(today, 3);
  if (columnId === "later") return addDays(today, 8);
  return null;
}
