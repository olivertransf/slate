"use client";

import { addDays, dayISO, formatDay, formatTime, type TaskRecord } from "@/lib/model";
import { useState } from "react";
import { ActionMenu, type ActionItem } from "./action-menu";
import { newId, usePlanner } from "./planner-context";
import { ReferenceIcon } from "./reference-icon";
import { Check } from "./check";

export function TaskRow({
  task,
  selected,
  onSelect,
  onComplete,
  onDelete,
  onReorder,
  draggable = false,
}: {
  task: TaskRecord;
  selected: boolean;
  onSelect: () => void;
  onComplete: () => void;
  onDelete?: () => void;
  onReorder?: () => void;
  draggable?: boolean;
}) {
  const day = dayISO(new Date());
  const { data, save } = usePlanner();
  const [contextPoint, setContextPoint] = useState<{ x: number; y: number } | null>(null);
  const [swiped, setSwiped] = useState(false);
  function patch(partial: Partial<TaskRecord>) { save("tasks", { ...task, ...partial }); }
  const actions: ActionItem[] = task.deletedAt ? [
    { label: task.kind === "note" ? "Restore note" : "Restore task", action: () => patch({ deletedAt: null }) },
  ] : [
    ...(task.kind === "note" ? [] : [{ label: task.completedAt ? "Mark incomplete" : "Complete", action: onComplete }]),
    { label: "Date", children: [
      { label: "Today", action: () => patch({ dueOn: day }) },
      { label: "Tomorrow", action: () => patch({ dueOn: addDays(day, 1) }) },
      { label: "Next week", action: () => patch({ dueOn: addDays(day, 7) }) },
      { label: "No date", action: () => patch({ dueOn: null, dueTime: null }) },
    ] },
    { label: "Priority", children: ([3, 2, 1, 0] as const).map((priority) => ({ label: ["None", "Low", "Medium", "High"][priority], checked: task.priority === priority, action: () => patch({ priority }) })) },
    { label: "Move to", children: [
      { label: "Inbox", checked: task.listId == null, action: () => patch({ listId: null, sectionId: null }) },
      ...data.lists.filter((list) => !list.deletedAt && !list.archivedAt).map((list) => ({ label: list.name, checked: list.id === task.listId, action: () => patch({ listId: list.id, sectionId: null }) })),
    ] },
    { label: "Duplicate", divider: true, action: () => save("tasks", { ...task, id: newId(), title: `${task.title} (copy)`, completedAt: null, sort: task.sort + 1 }) },
    { label: "Delete", danger: true, action: () => onDelete ? onDelete() : patch({ deletedAt: new Date().toISOString() }) },
  ];
  const doneCount = task.subtasks.filter((item) => item.done).length;

  return (
    <div
      className={`task swipe-row${selected ? " selected" : ""}${task.completedAt ? " done" : ""}`}
      onContextMenu={(event) => { event.preventDefault(); setContextPoint({ x: event.clientX, y: event.clientY }); }}
      onPointerDown={(event) => {
        setSwiped(false);
        if (event.pointerType !== "touch" || (event.target as Element).closest("button:not(.task-main)")) return;
        const startX = event.clientX;
        const startY = event.clientY;
        const pointerId = event.pointerId;
        const row = event.currentTarget;
        function move(next: PointerEvent) {
          if (next.pointerId !== pointerId) return;
          if (Math.abs(next.clientY - startY) > Math.abs(next.clientX - startX) + 12) {
            cancel();
            return;
          }
          const delta = Math.min(0, next.clientX - startX);
          row.style.transform = `translateX(${delta}px)`;
        }
        function up(next: PointerEvent) {
          if (next.pointerId !== pointerId) return;
          cancel();
          const distance = next.clientX - startX;
          if (Math.abs(distance) > 72) setSwiped(true);
          if (distance < -72) onDelete?.();
          if (distance > 72) onReorder?.();
        }
        function cancel() {
          row.style.transform = "";
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", cancel);
        }
        window.addEventListener("pointercancel", cancel);
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) return;
        event.dataTransfer.setData("text/plain", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <span>
        {task.deletedAt ? <span className="note-mark" /> : task.kind === "note" ? <span className="note-mark"><ReferenceIcon name="list-sidebar" /></span> : <Check on={Boolean(task.completedAt)} label={task.completedAt ? `Mark ${task.title} incomplete` : `Complete ${task.title}`} onClick={onComplete} />}
      </span>
      <button type="button" className="task-main" aria-label={task.title} aria-expanded={selected}
        onClick={(event) => { if (!swiped || event.detail === 0) onSelect(); }}
        onKeyDown={(event) => {
          if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          setContextPoint({ x: bounds.left, y: bounds.bottom });
        }}>
        <span className="title">{task.title}</span>
        <span className="when">
          {task.dueOn && (
            <span className={`due ${dueTone(task.dueOn, day)}`}>
              <span className="date">{formatDay(task.dueOn, day)}</span>
              {task.dueTime && <span className="clock">{formatTime(task.dueTime)}</span>}
            </span>
          )}
          {task.priority > 0 && <Flag level={task.priority} />}
        </span>
        <span className="task-icons">
          {task.subtasks.length > 0 && (
            <span className="task-extra" title="Subtasks">
              <Mini d="M4 6.5h8M4 9.5h8M4 4h.01M4 12h.01" />
              {doneCount}/{task.subtasks.length}
            </span>
          )}
          {task.notes.trim().length > 0 && (
            <span className="task-extra" title="Notes">
              <Mini d="M5 5.5h6M5 8h6M5 10.5h3.5M4 3.5h8a1 1 0 0 1 1 1v7l-2.5 2.5H4a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1z" />
            </span>
          )}
          {task.remindMinutesBefore != null && (
            <span className="task-extra" title="Reminder">
              <Mini d="M8 3.2a3.2 3.2 0 0 1 3.2 3.2v1.4l.8 1.6H4l.8-1.6V6.4A3.2 3.2 0 0 1 8 3.2zM6.8 11.2a1.2 1.2 0 0 0 2.4 0" />
            </span>
          )}
        </span>
      </button>
      <ActionMenu label={`Actions for ${task.title}`} icon={<span aria-hidden="true">···</span>} className="task-actions" items={actions} contextPoint={contextPoint} onContextClose={() => setContextPoint(null)} />
    </div>
  );
}

function dueTone(dueOn: string, day: string): "overdue" | "today" | "soon" | "later" {
  if (dueOn < day) return "overdue";
  if (dueOn === day) return "today";
  if (dueOn <= addDays(day, 6)) return "soon";
  return "later";
}

function Flag({ level }: { level: TaskRecord["priority"] }) {
  return (
    <svg className={`flag p${level}`} viewBox="0 0 16 16" aria-label={`Priority ${level}`}>
      <path d="M4 2.5h7.2L9.4 5.6 11.2 8.7H4z" fill="currentColor" />
      <path d="M4 2.2v11.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function Mini({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
