"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { patchUi, useUiSettings } from "@/lib/ui-settings";
import {
  addDays,
  alive,
  countdownAmount,
  daysBetween,
  formatDay,
  formatTime,
  parseDay,
  startOfWeek,
  taskOpen,
  type CountdownRecord,
  type ListRecord,
  type TaskRecord,
} from "@/lib/model";
import { Check } from "./check";
import { today, usePlanner } from "./planner-context";

type Mode = "month" | "weeks" | "week" | "day" | "agenda";

type GEvent = {
  id: string;
  title: string;
  day: string;
  time: string | null;
  allDay: boolean;
  color: string;
  calendarId: string;
  calendar: string;
  link: string;
};

type Detail =
  | { kind: "event"; event: GEvent }
  | { kind: "countdown"; item: CountdownRecord; day: string };

const MODES: Mode[] = ["month", "weeks", "week", "day", "agenda"];

export function CalendarView({
  onSelect,
}: {
  onSelect: (id: string) => void;
}) {
  const { data, save, completeTask } = usePlanner();
  const settings = useUiSettings();
  const [mode, setMode] = useState<Mode>("weeks");
  const [shownWeeks, setShownWeeks] = useState(settings.calWeeks);
  const [anchor, setAnchor] = useState(today());
  const [visibleDay, setVisibleDay] = useState(startOfWeek(today()));
  const [focus, setFocus] = useState(0);
  const [detailed, setDetailed] = useState(true);
  const [hourHeight, setHourHeight] = useState(48);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [events, setEvents] = useState<GEvent[]>([]);
  const [span, setSpan] = useState(() => ({
    start: addDays(startOfWeek(today()), -28),
    end: addDays(startOfWeek(today()), 70),
  }));
  const tasks = data.tasks.filter(taskOpen);
  const lists = alive(data.lists);
  const countdowns = alive(data.countdowns);
  const range = useMemo(() => {
    if (mode === "month" || mode === "weeks") return span;
    if (mode === "week") {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, 7) };
    }
    if (mode === "day") return { start: anchor, end: addDays(anchor, 1) };
    return { start: anchor, end: addDays(anchor, 14) };
  }, [mode, anchor, span]);

  useEffect(() => {
    if (!settings.showGoogle) {
      setEvents([]);
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/google/events?start=${range.start}&end=${range.end}`, { signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() as Promise<{ events: GEvent[] }> : { events: [] }))
      .then((payload) => {
        setEvents(payload.events.filter((event) => !settings.hiddenCalendars.includes(event.calendarId)));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [range.start, range.end, settings.showGoogle, settings.hiddenCalendars]);

  const spanTimer = useRef<number | null>(null);
  const pendingWeeks = useRef<number | null>(null);
  const onVisible = useCallback((start: string, end: string) => {
    setVisibleDay(start);
    if (spanTimer.current) window.clearTimeout(spanTimer.current);
    spanTimer.current = window.setTimeout(() => {
      setSpan((current) => {
        const nextStart = addDays(start, -14);
        const nextEnd = addDays(end, 21);
        if (current.start === nextStart && current.end === nextEnd) return current;
        return { start: nextStart, end: nextEnd };
      });
    }, 160);
  }, []);

  useEffect(() => {
    if (pendingWeeks.current == null) return;
    const next = pendingWeeks.current;
    pendingWeeks.current = null;
    patchUi({ calWeeks: next });
  }, [shownWeeks]);

  function zoomWeeks(delta: number) {
    setShownWeeks((current) => {
      const next = Math.min(8, Math.max(1, current + delta));
      pendingWeeks.current = next;
      return next;
    });
    setMode("weeks");
  }

  function chooseMode(next: Mode) {
    setMode(next);
    if (next === "month") setShownWeeks(6);
    if (next === "weeks") setShownWeeks(settings.calWeeks);
  }

  function shift(direction: number) {
    if (mode === "month" || mode === "weeks") {
      setAnchor(addDays(visibleDay, direction * shownWeeks * 7));
      setFocus((value) => value + 1);
      return;
    }
    const step = mode === "week" || mode === "agenda" ? 7 : 1;
    setAnchor(addDays(anchor, direction * step));
  }

  function jumpToday() {
    setAnchor(today());
    setFocus((value) => value + 1);
  }

  function moveTask(task: TaskRecord, day: string, minutes: number | null) {
    save("tasks", {
      ...task,
      dueOn: day,
      dueTime: minutes == null ? task.dueTime : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    });
  }

  function openTask(id: string) {
    setDetail(null);
    onSelect(id);
  }

  const label = mode === "day"
    ? parseDay(anchor).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    : parseDay(mode === "month" || mode === "weeks" ? visibleDay : mode === "week" ? startOfWeek(anchor) : anchor).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const grid = mode === "month" || mode === "weeks";

  return (
    <section className="stage cal-stage">
      <header>
        <h1>{label}</h1>
        <div className="cal-tools">
          <button type="button" className={detailed ? "cal-chip on" : "cal-chip"} onClick={() => setDetailed((value) => !value)}>Detailed</button>
          <div className="seg cal-seg">
            {MODES.map((item) => (
              <button key={item} type="button" className={mode === item ? "on" : ""} onClick={() => chooseMode(item)}>
                {item[0]?.toUpperCase()}{item.slice(1)}
              </button>
            ))}
          </div>
          {grid && (
            <div className="cal-nav" aria-label="Weeks shown">
              <button type="button" onClick={() => zoomWeeks(-1)} aria-label="Fewer weeks">−</button>
              <span>{shownWeeks}w</span>
              <button type="button" onClick={() => zoomWeeks(1)} aria-label="More weeks">+</button>
            </div>
          )}
          <div className="cal-nav">
            <button type="button" onClick={() => shift(-1)} aria-label="Previous">‹</button>
            <button type="button" onClick={jumpToday}>Today</button>
            <button type="button" onClick={() => shift(1)} aria-label="Next">›</button>
          </div>
        </div>
      </header>
      <div className="cal-body">
        <div className="cal-main">
          {grid && (
            <WeekBoard
              weekCount={shownWeeks}
              focusDay={anchor}
              focus={focus}
              monthDay={visibleDay}
              tasks={tasks}
              lists={lists}
              countdowns={countdowns}
              events={events}
              detailed={detailed}
              selectedKey={detailKey(detail)}
              onTask={openTask}
              onEvent={(event) => setDetail({ kind: "event", event })}
              onCountdown={(item, day) => setDetail({ kind: "countdown", item, day })}
              onMove={moveTask}
              onComplete={completeTask}
              onVisible={onVisible}
              onZoom={zoomWeeks}
            />
          )}
          {mode === "week" && (
            <TimeGrid anchor={startOfWeek(anchor)} days={7} hourHeight={hourHeight} onHourHeight={setHourHeight} tasks={tasks} lists={lists} countdowns={countdowns} events={events} detailed={detailed} onTask={openTask} onEvent={(event) => setDetail({ kind: "event", event })} onCountdown={(item, day) => setDetail({ kind: "countdown", item, day })} onMove={moveTask} onComplete={completeTask} />
          )}
          {mode === "day" && (
            <TimeGrid anchor={anchor} days={1} hourHeight={hourHeight} onHourHeight={setHourHeight} tasks={tasks} lists={lists} countdowns={countdowns} events={events} detailed={detailed} onTask={openTask} onEvent={(event) => setDetail({ kind: "event", event })} onCountdown={(item, day) => setDetail({ kind: "countdown", item, day })} onMove={moveTask} onComplete={completeTask} />
          )}
          {mode === "agenda" && (
            <Agenda anchor={anchor} tasks={tasks} lists={lists} countdowns={countdowns} events={events} detailed={detailed} onTask={openTask} onEvent={(event) => setDetail({ kind: "event", event })} onCountdown={(item, day) => setDetail({ kind: "countdown", item, day })} onComplete={completeTask} />
          )}
        </div>
        {detail && <ItemDetail detail={detail} onClose={() => setDetail(null)} />}
      </div>
    </section>
  );
}

function detailKey(detail: Detail | null): string | null {
  if (!detail) return null;
  if (detail.kind === "event") return `event:${detail.event.id}`;
  return `countdown:${detail.item.id}:${detail.day}`;
}

function WeekBoard({
  weekCount,
  focusDay,
  focus,
  monthDay,
  tasks,
  lists,
  countdowns,
  events,
  detailed,
  selectedKey,
  onTask,
  onEvent,
  onCountdown,
  onMove,
  onComplete,
  onVisible,
  onZoom,
}: {
  weekCount: number;
  focusDay: string;
  focus: number;
  monthDay: string;
  tasks: TaskRecord[];
  lists: ListRecord[];
  countdowns: CountdownRecord[];
  events: GEvent[];
  detailed: boolean;
  selectedKey: string | null;
  onTask: (id: string) => void;
  onEvent: (event: GEvent) => void;
  onCountdown: (item: CountdownRecord, day: string) => void;
  onMove: (task: TaskRecord, day: string, minutes: number | null) => void;
  onComplete: (task: TaskRecord) => void;
  onVisible: (start: string, end: string) => void;
  onZoom: (delta: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const originRef = useRef(addDays(startOfWeek(today()), -7 * 12));
  const [origin, setOrigin] = useState(originRef.current);
  const [weekTotal, setWeekTotal] = useState(36);
  const [height, setHeight] = useState(640);
  const shift = useRef<number | null>(null);
  const hold = useRef(false);
  const prevRow = useRef(0);
  const seenWeek = useRef("");
  const rowHeight = height > 0 ? height / Math.max(1, weekCount) : 120;
  const month = parseDay(monthDay).getMonth();
  const weeks = useMemo(() => Array.from({ length: weekTotal }, (_, index) => addDays(origin, index * 7)), [origin, weekTotal]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    setHeight(el.clientHeight || 640);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const index = Math.max(0, Math.round(daysBetween(originRef.current, startOfWeek(focusDay)) / 7));
    hold.current = true;
    el.scrollTop = index * rowHeight;
    hold.current = false;
    prevRow.current = rowHeight;
  }, [focus]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || shift.current == null) return;
    hold.current = true;
    el.scrollTop += shift.current;
    shift.current = null;
    hold.current = false;
  }, [origin]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || prevRow.current === 0 || prevRow.current === rowHeight) {
      prevRow.current = rowHeight;
      return;
    }
    const index = el.scrollTop / prevRow.current;
    hold.current = true;
    el.scrollTop = index * rowHeight;
    hold.current = false;
    prevRow.current = rowHeight;
  }, [rowHeight]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let pinch = 0;
    let gestureScale = 1;
    function distance(touches: TouchList) {
      const [a, b] = [touches[0], touches[1]];
      if (!a || !b) return 0;
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    function wheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      onZoom(event.deltaY > 0 ? 1 : -1);
    }
    function touchStart(event: TouchEvent) {
      if (event.touches.length === 2) pinch = distance(event.touches);
    }
    function touchMove(event: TouchEvent) {
      if (event.touches.length !== 2 || pinch === 0) return;
      event.preventDefault();
      const next = distance(event.touches);
      const ratio = next / pinch;
      if (ratio > 1.12) {
        onZoom(-1);
        pinch = next;
      } else if (ratio < 0.89) {
        onZoom(1);
        pinch = next;
      }
    }
    function touchEnd() {
      pinch = 0;
    }
    function gestureStart(event: Event) {
      gestureScale = 1;
      event.preventDefault();
    }
    function gestureChange(event: Event) {
      event.preventDefault();
      const scale = (event as Event & { scale?: number }).scale ?? 1;
      const ratio = scale / gestureScale;
      if (ratio > 1.12) {
        onZoom(-1);
        gestureScale = scale;
      } else if (ratio < 0.89) {
        onZoom(1);
        gestureScale = scale;
      }
    }
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchstart", touchStart, { passive: true });
    el.addEventListener("touchmove", touchMove, { passive: false });
    el.addEventListener("touchend", touchEnd);
    el.addEventListener("gesturestart", gestureStart);
    el.addEventListener("gesturechange", gestureChange);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchstart", touchStart);
      el.removeEventListener("touchmove", touchMove);
      el.removeEventListener("touchend", touchEnd);
      el.removeEventListener("gesturestart", gestureStart);
      el.removeEventListener("gesturechange", gestureChange);
    };
  }, [onZoom]);

  function onScroll() {
    const el = scroller.current;
    if (!el || hold.current) return;
    const row = rowHeight;
    if (el.scrollTop < row * 4 && weekTotal < 80) {
      const add = 8;
      shift.current = add * row;
      hold.current = true;
      const nextOrigin = addDays(originRef.current, -7 * add);
      originRef.current = nextOrigin;
      setOrigin(nextOrigin);
      setWeekTotal((value) => value + add);
      return;
    }
    if (el.scrollHeight - el.scrollTop - el.clientHeight < row * 4 && weekTotal < 80) {
      setWeekTotal((value) => value + 8);
    }
    const index = Math.max(0, Math.round(el.scrollTop / row));
    const start = addDays(originRef.current, index * 7);
    if (start === seenWeek.current) return;
    seenWeek.current = start;
    onVisible(start, addDays(start, weekCount * 7));
  }

  function drop(event: React.DragEvent, day: string) {
    const id = event.dataTransfer.getData("text/plain");
    const task = tasks.find((item) => item.id === id);
    if (task) onMove(task, day, null);
  }

  const slots = Math.max(0, Math.floor((rowHeight - 26) / 20));

  return (
    <div className="cal-board">
      <div className="cal-pan">
      <div className="cal-dows">
        <div className="dow gutter" />
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => <div key={label} className="dow">{label}</div>)}
      </div>
      <div className="cal-scroll" ref={scroller} onScroll={onScroll}>
        {weeks.map((start) => (
          <div key={start} className="cal-week" style={{ height: rowHeight }}>
            <div className="week-num">W{isoWeek(addDays(start, 4))}</div>
            {Array.from({ length: 7 }, (_, index) => addDays(start, index)).map((day) => {
              const outside = parseDay(day).getMonth() !== month;
              const chips = dayChips(day, tasks, lists, countdowns, events);
              const visible = chips.slice(0, slots);
              const extra = chips.length - visible.length;
              return (
                <div
                  key={day}
                  className={outside ? "cell out" : day === today() ? "cell today" : "cell"}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => drop(event, day)}
                >
                  <time>{Number(day.slice(8))}</time>
                  {visible.map((chip) => (
                    <ChipView key={chip.key} chip={chip} detailed={detailed} selected={chip.key === selectedKey} onTask={onTask} onEvent={onEvent} onCountdown={onCountdown} onComplete={onComplete} />
                  ))}
                  {extra > 0 && <div className="more">+{extra}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

function minutesOf(value: string | null): number {
  const [hour, minute] = (value ?? "09:00").split(":").map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function placeLanes(items: { key: string; start: number }[], duration = 60): Map<string, { column: number; columns: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
  const clusters: { key: string; start: number; end: number; column: number }[][] = [];
  let cluster: { key: string; start: number; end: number; column: number }[] = [];
  let clusterEnd = -1;
  for (const item of sorted) {
    const end = item.start + duration;
    if (cluster.length > 0 && item.start >= clusterEnd) {
      clusters.push(cluster);
      cluster = [];
      clusterEnd = -1;
    }
    let column = 0;
    while (cluster.some((other) => other.column === column && other.start < end && item.start < other.end)) column += 1;
    cluster.push({ key: item.key, start: item.start, end, column });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length > 0) clusters.push(cluster);
  const spots = new Map<string, { column: number; columns: number }>();
  for (const group of clusters) {
    const columns = Math.max(...group.map((item) => item.column)) + 1;
    for (const item of group) spots.set(item.key, { column: item.column, columns });
  }
  return spots;
}

function laneStyle(start: number, spot: { column: number; columns: number }, hourHeight: number, color: string): React.CSSProperties {
  return {
    top: start * (hourHeight / 60),
    height: Math.max(22, hourHeight),
    left: `calc(${(spot.column / spot.columns) * 100}% + 2px)`,
    width: `calc(${100 / spot.columns}% - 4px)`,
    right: "auto",
    ["--c" as string]: color,
  };
}

function TimeGrid({
  anchor,
  days,
  hourHeight,
  onHourHeight,
  tasks,
  lists,
  countdowns,
  events,
  detailed,
  onTask,
  onEvent,
  onCountdown,
  onMove,
  onComplete,
}: {
  anchor: string;
  days: number;
  hourHeight: number;
  onHourHeight: (height: number) => void;
  tasks: TaskRecord[];
  lists: ListRecord[];
  countdowns: CountdownRecord[];
  events: GEvent[];
  detailed: boolean;
  onTask: (id: string) => void;
  onEvent: (event: GEvent) => void;
  onCountdown: (item: CountdownRecord, day: string) => void;
  onMove: (task: TaskRecord, day: string, minutes: number | null) => void;
  onComplete: (task: TaskRecord) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const columns = useMemo(() => Array.from({ length: days }, (_, index) => addDays(anchor, index)), [anchor, days]);
  const hours = Array.from({ length: 24 }, (_, index) => index);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    function wheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      onHourHeight(Math.min(96, Math.max(28, hourHeight + (event.deltaY > 0 ? -4 : 4))));
    }
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [hourHeight, onHourHeight]);

  function drop(event: React.DragEvent, day: string) {
    const id = event.dataTransfer.getData("text/plain");
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    const minutes = Math.round((ratio * 24 * 60) / 15) * 15;
    onMove(task, day, Math.min(minutes, 23 * 60 + 45));
  }

  return (
    <div className="time-wrap" ref={wrap}>
      <div className={days === 1 ? "allday day" : "allday"}>
        <div className="hour">All day</div>
        {columns.map((day) => (
          <div key={day} className="allday-col">
            {dayChips(day, tasks, lists, countdowns, events).filter((chip) => chip.allDay).slice(0, 4).map((chip) => (
              <ChipView key={chip.key} chip={chip} detailed={detailed} selected={false} onTask={onTask} onEvent={onEvent} onCountdown={onCountdown} onComplete={onComplete} />
            ))}
          </div>
        ))}
      </div>
      <div className={days === 1 ? "timegrid day" : "timegrid"}>
        <div />
        {columns.map((day) => (
          <div key={day} className={day === today() ? "dow today" : "dow"}>
            <span>{parseDay(day).toLocaleDateString(undefined, { weekday: "short" })}</span>
            <strong>{Number(day.slice(8))}</strong>
          </div>
        ))}
        <div className="hour-col">
          {hours.map((hour) => <div key={hour} className="hour" style={{ height: hourHeight }}>{formatTime(`${String(hour).padStart(2, "0")}:00`)}</div>)}
        </div>
        {columns.map((day) => {
          const timedTasks = tasks.filter((task) => task.dueOn === day && task.dueTime);
          const timedEvents = events.filter((event) => event.day === day && event.time);
          const spots = placeLanes([
            ...timedTasks.map((task) => ({ key: `task:${task.id}`, start: minutesOf(task.dueTime) })),
            ...timedEvents.map((event) => ({ key: `event:${event.id}`, start: minutesOf(event.time) })),
          ]);
          return (
            <div key={day} className="time-col" onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, day)}>
              {hours.map((hour) => <div key={hour} className="slot" style={{ height: hourHeight }} />)}
              {timedTasks.map((task) => {
                const spot = spots.get(`task:${task.id}`) ?? { column: 0, columns: 1 };
                return (
                  <button
                    key={task.id}
                    type="button"
                    className="event"
                    draggable
                    style={laneStyle(minutesOf(task.dueTime), spot, hourHeight, taskColor(task, lists))}
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)}
                    onClick={() => onTask(task.id)}
                  >
                    {detailed && <Check quiet on={false} onClick={() => onComplete(task)} />}
                    {formatTime(task.dueTime)} {task.title}
                  </button>
                );
              })}
              {timedEvents.map((event) => {
                const spot = spots.get(`event:${event.id}`) ?? { column: 0, columns: 1 };
                return (
                  <button key={event.id} type="button" className="event" style={laneStyle(minutesOf(event.time), spot, hourHeight, event.color)} onClick={() => onEvent(event)}>
                    {formatTime(event.time)} {event.title}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({
  anchor,
  tasks,
  lists,
  countdowns,
  events,
  detailed,
  onTask,
  onEvent,
  onCountdown,
  onComplete,
}: {
  anchor: string;
  tasks: TaskRecord[];
  lists: ListRecord[];
  countdowns: CountdownRecord[];
  events: GEvent[];
  detailed: boolean;
  onTask: (id: string) => void;
  onEvent: (event: GEvent) => void;
  onCountdown: (item: CountdownRecord, day: string) => void;
  onComplete: (task: TaskRecord) => void;
}) {
  const days = Array.from({ length: 14 }, (_, index) => addDays(anchor, index));
  return (
    <div className="agenda">
      {days.map((day) => {
        const items = tasks.filter((task) => task.dueOn === day);
        const marks = datedCountdowns(countdowns, day);
        const dayEvents = events.filter((event) => event.day === day);
        if (items.length === 0 && marks.length === 0 && dayEvents.length === 0) return null;
        return (
          <div key={day}>
            <h2>{formatDay(day)}</h2>
            {items.map((task) => (
              <div key={task.id} className="task cal-row" style={{ ["--c" as string]: taskColor(task, lists) }}>
                {detailed && <Check on={false} onClick={() => onComplete(task)} />}
                <button type="button" onClick={() => onTask(task.id)}>
                  <span className="title">{task.title}</span>
                  <span className="meta">{formatTime(task.dueTime)}</span>
                </button>
              </div>
            ))}
            {marks.map((item) => (
              <button key={item.id} type="button" className="task cal-row" style={{ ["--c" as string]: item.color || "#8e4ec6" }} onClick={() => onCountdown(item, day)}>
                <span className="title">{item.title}</span>
                <span className="meta">{countdownAmount(item, day)} {item.unit}s</span>
              </button>
            ))}
            {dayEvents.map((event) => (
              <button key={event.id} type="button" className="task cal-row" style={{ ["--c" as string]: event.color || "#4772fa" }} onClick={() => onEvent(event)}>
                <span className="title">{event.title}</span>
                <span className="meta">{event.allDay ? "All day" : formatTime(event.time)}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ItemDetail({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  const day = detail.kind === "event" ? detail.event.day : detail.day;
  const title = detail.kind === "event" ? detail.event.title : detail.item.title;
  const color = detail.kind === "event" ? detail.event.color : detail.item.color || "#8e4ec6";
  const when = parseDay(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const time = detail.kind === "event"
    ? (detail.event.allDay || !detail.event.time ? "All day" : formatTime(detail.event.time))
    : `${countdownAmount(detail.item, day)} ${detail.item.unit}s`;
  return (
    <aside className="cal-detail" role="dialog" aria-label={title}>
      <div className="cal-detail-bar">
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <i className="cal-detail-color" style={{ background: color }} />
      <h2>{title}</h2>
      <p>{when}</p>
      <p>{time}</p>
      {detail.kind === "event" && <p className="cal-detail-meta">{detail.event.calendar}</p>}
      {detail.kind === "countdown" && <p className="cal-detail-meta">{detail.item.mode === "countup" ? "Count up" : "Countdown"}{detail.item.repeatYearly ? " · yearly" : ""}</p>}
    </aside>
  );
}

function datedCountdowns(items: CountdownRecord[], day: string): CountdownRecord[] {
  return items.filter((item) => {
    if (item.day === day) return true;
    return item.repeatYearly && item.day.slice(5) === day.slice(5);
  });
}

type Chip = {
  key: string;
  title: string;
  color: string;
  allDay: boolean;
  task?: TaskRecord;
  event?: GEvent;
  countdown?: CountdownRecord;
  day: string;
};

function dayChips(day: string, tasks: TaskRecord[], lists: ListRecord[], countdowns: CountdownRecord[], events: GEvent[]): Chip[] {
  const chips: Chip[] = [
    ...tasks.filter((task) => task.dueOn === day).map((task) => ({
      key: `task:${task.id}`,
      title: task.dueTime ? `${formatTime(task.dueTime)} ${task.title}` : task.title,
      color: taskColor(task, lists),
      allDay: task.dueTime == null,
      task,
      day,
    })),
    ...datedCountdowns(countdowns, day).map((item) => ({
      key: `countdown:${item.id}:${day}`,
      title: `${countdownAmount(item, day)} ${item.title}`,
      color: item.color || "#8e4ec6",
      allDay: true,
      countdown: item,
      day,
    })),
    ...events.filter((event) => event.day === day).map((event) => ({
      key: `event:${event.id}`,
      title: event.allDay || !event.time ? event.title : `${formatTime(event.time)} ${event.title}`,
      color: event.color || "#4772fa",
      allDay: event.allDay || !event.time,
      event,
      day,
    })),
  ];
  return chips.sort((a, b) => Number(b.allDay) - Number(a.allDay));
}

function taskColor(task: TaskRecord, lists: ListRecord[]): string {
  return lists.find((list) => list.id === task.listId)?.color ?? "#4772fa";
}

function ChipView({
  chip,
  detailed,
  selected,
  onTask,
  onEvent,
  onCountdown,
  onComplete,
}: {
  chip: Chip;
  detailed: boolean;
  selected: boolean;
  onTask: (id: string) => void;
  onEvent: (event: GEvent) => void;
  onCountdown: (item: CountdownRecord, day: string) => void;
  onComplete: (task: TaskRecord) => void;
}) {
  function open() {
    if (chip.task) onTask(chip.task.id);
    else if (chip.event) onEvent(chip.event);
    else if (chip.countdown) onCountdown(chip.countdown, chip.day);
  }
  return (
    <div className={selected ? "pill on" : "pill"} style={{ ["--c" as string]: chip.color }} draggable={Boolean(chip.task)} onDragStart={(event) => chip.task && event.dataTransfer.setData("text/plain", chip.task.id)}>
      {detailed && chip.task && <Check on={false} onClick={() => onComplete(chip.task as TaskRecord)} />}
      <button type="button" onClick={open}>{chip.title}</button>
    </div>
  );
}

function isoWeek(value: string): number {
  const date = parseDay(value);
  const target = new Date(date);
  target.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const weekOne = new Date(target.getFullYear(), 0, 4);
  weekOne.setDate(weekOne.getDate() - ((weekOne.getDay() + 6) % 7));
  return 1 + Math.round((target.getTime() - weekOne.getTime()) / 604_800_000);
}
