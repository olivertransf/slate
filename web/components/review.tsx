"use client";

import { useState } from "react";
import { addDays, dayISO, formatDay, matchesView, sortTasks, taskOpen, visibleLists } from "@/lib/model";
import { today, usePlanner } from "./planner-context";

const LIMIT = 5;

export function ReviewView({ onTask, onView }: { onTask: (id: string) => void; onView: (view: string) => void }) {
  const { data } = usePlanner();
  const [expanded, setExpanded] = useState<string[]>([]);
  const day = today();
  const start = addDays(day, -6);
  const end = addDays(day, 7);
  const activeLists = new Set(visibleLists(data.lists).map((list) => list.id));
  const tasks = sortTasks(data.tasks.filter((task) => taskOpen(task) && (task.listId == null || activeLists.has(task.listId))), "date");
  const completions = data.tasks.flatMap((task) => {
    if (task.deletedAt) return [];
    return [task.completedAt, ...(task.repeatHistory ?? []).map((entry) => entry.completedAt)]
      .flatMap((stamp) => {
        if (!stamp) return [];
        const date = dayISO(new Date(stamp));
        return date >= start && date <= day ? [{ task, date, stamp }] : [];
      });
  }).sort((a, b) => b.stamp.localeCompare(a.stamp));
  const groups = [
    { id: "inbox", title: "Inbox to triage", empty: "Inbox is clear", view: "inbox", rows: tasks.filter((task) => matchesView(task, "inbox", day)).map((task) => ({ task, date: task.dueOn, stamp: "inbox" })) },
    { id: "missed", title: "Missed planned dates", empty: "No missed planned dates", rows: tasks.filter((task) => !!task.startOn && task.startOn < day).map((task) => ({ task, date: task.startOn, stamp: "missed" })) },
    { id: "deadlines", title: "Upcoming deadlines", empty: "No deadlines in the next 7 days", rows: tasks.filter((task) => !!task.dueOn && task.dueOn >= day && task.dueOn <= end).map((task) => ({ task, date: task.dueOn, stamp: "deadline" })) },
    { id: "overdue", title: "Overdue deadlines", empty: "No overdue deadlines", view: "overdue", rows: tasks.filter((task) => matchesView(task, "overdue", day)).map((task) => ({ task, date: task.dueOn, stamp: "overdue" })) },
    { id: "completed", title: "Completed in the past 7 days", empty: "No completions this week", view: "completed", rows: completions },
  ];

  return (
    <section className="stage workspace-stage">
      <header><h1>Weekly review</h1></header>
      <div className="workspace-body review-workspace">
        {groups.map((group) => {
          const visible = expanded.includes(group.id);
          return (
            <section className="workspace-card" key={group.id}>
              <div className="workspace-card-head"><h2>{group.title}</h2><span>{group.rows.length}</span></div>
              {(visible ? group.rows : group.rows.slice(0, LIMIT)).map(({ task, date, stamp }, index) => (
                <button type="button" className="review-row" key={`${task.id}:${stamp}:${index}`} onClick={() => onTask(task.id)}>
                  <span>{task.title}</span>
                  {date && <time dateTime={date}>{formatDay(date, day)}</time>}
                </button>
              ))}
              {!group.rows.length && <p className="workspace-empty">{group.empty}</p>}
              {(group.rows.length > LIMIT || group.view && group.rows.length > 0) && (
                <div className="workspace-card-foot">
                  {group.rows.length > LIMIT && <button type="button" className="text-button" aria-expanded={visible} onClick={() => setExpanded((open) => visible ? open.filter((id) => id !== group.id) : [...open, group.id])}>{visible ? "Show fewer" : `Show all ${group.rows.length}`}</button>}
                  {group.view && <button type="button" className="text-button" onClick={() => onView(group.view!)}>Open {group.view === "inbox" ? "Inbox" : group.view === "completed" ? "Completed" : "Overdue"}</button>}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
