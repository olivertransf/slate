"use client";

import { addDays, dayISO, formatDay, formatTime, type TaskRecord } from "@/lib/model";
import { Check } from "./check";

export function TaskRow({
  task,
  selected,
  onSelect,
  onComplete,
  draggable = false,
}: {
  task: TaskRecord;
  selected: boolean;
  onSelect: () => void;
  onComplete: () => void;
  draggable?: boolean;
}) {
  const day = dayISO(new Date());
  const doneCount = task.subtasks.filter((item) => item.done).length;

  return (
    <div
      className={selected ? "task selected" : task.completedAt ? "task done" : "task"}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) return;
        event.dataTransfer.setData("text/plain", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={onSelect}
    >
      <span onClick={(event) => event.stopPropagation()}>
        <Check on={Boolean(task.completedAt)} onClick={onComplete} />
      </span>
      <div className="task-main">
        <div className="title">{task.title}</div>
        <div className="when">
          {task.dueOn && (
            <span className={`due ${dueTone(task.dueOn, day)}`}>
              <span className="date">{formatDay(task.dueOn, day)}</span>
              {task.dueTime && <span className="clock">{formatTime(task.dueTime)}</span>}
            </span>
          )}
          {task.priority > 0 && <Flag level={task.priority} />}
        </div>
        <div className="task-icons">
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
        </div>
      </div>
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
