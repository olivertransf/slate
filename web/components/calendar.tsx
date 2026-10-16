"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type WheelEvent as ReactWheelEvent } from "react";
import { patchUi, useUiSettings } from "@/lib/ui-settings";
import {
  addDays,
  addMonths,
  alive,
  countdownAmount,
  daysBetween,
  formatDay,
  formatTime,
  habitCheckId,
  parseDay,
  startOfWeek,
  taskOpen,
  type CountdownRecord,
  type HabitRecord,
  type ListRecord,
  type TaskRecord,
} from "@/lib/model";
import { GOOGLE_CHANGED, rememberGoogle, storedGoogle, type GEvent } from "@/lib/google-client";
import { Check } from "./check";
import { checkFor, today, usePlanner } from "./planner-context";

type Mode = "focus" | "month" | "weeks" | "week" | "day" | "agenda";

const PHONE_QUERY = "(max-width: 980px)";

type Detail =
  | { kind: "event"; event: GEvent }
  | { kind: "countdown"; item: CountdownRecord; day: string };

const MODES: Mode[] = ["month", "weeks", "week", "day", "agenda"];
export function CalendarView({
  onSelect,
  onMenu,
  onDay,
}: {
  onSelect: (id: string) => void;
  onMenu?: () => void;
  onDay?: (day: string) => void;
}) {
  const { data, save, completeTask } = usePlanner();
  const settings = useUiSettings();
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches);
  const [mode, setMode] = useState<Mode>(() => initialMode());
  const [viewsOpen, setViewsOpen] = useState(false);
  const [shownWeeks, setShownWeeks] = useState(settings.calWeeks);
  const [anchor, setAnchor] = useState(() => (typeof window === "undefined" ? today() : window.sessionStorage.getItem("slate-cal-anchor") || today()));
  const [visibleDay, setVisibleDay] = useState(startOfWeek(today()));
  const [focus, setFocus] = useState(0);
  const [detailed, setDetailed] = useState(true);
  const [hourHeight, setHourHeight] = useState(48);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [events, setEvents] = useState<GEvent[]>([]);
  const [googleGen, setGoogleGen] = useState(0);
  const [span, setSpan] = useState(() => ({
    start: addDays(startOfWeek(today()), -28),
    end: addDays(startOfWeek(today()), 70),
  }));
  const tasks = data.tasks.filter(taskOpen);
  const lists = alive(data.lists);
  const countdowns = alive(data.countdowns);
  const range = useMemo(() => {
    if (mode === "focus") {
      const month = `${anchor.slice(0, 7)}-01`;
      const start = addDays(startOfWeek(month), -7);
      return { start, end: addDays(start, 56) };
    }
    if (mode === "month" || mode === "weeks") return span;
    if (mode === "week") {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, 7) };
    }
    if (mode === "day") return { start: anchor, end: addDays(anchor, 1) };
    return { start: anchor, end: addDays(anchor, 14) };
  }, [mode, anchor, span]);

  useEffect(() => {
    const media = window.matchMedia(PHONE_QUERY);
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!narrow && mode === "focus") setMode("weeks");
  }, [narrow, mode]);

  useEffect(() => {
    onDay?.(anchor);
  }, [anchor, onDay]);

  useEffect(() => {
    if (narrow) window.sessionStorage.setItem("slate-cal-phone", mode);
    else if (mode !== "focus") window.sessionStorage.setItem("slate-cal-mode", mode);
    window.sessionStorage.setItem("slate-cal-anchor", anchor);
  }, [mode, anchor, narrow]);

  useEffect(() => {
    if (!settings.showGoogle) {
      setEvents([]);
      return;
    }
    const visible = (items: GEvent[]) => items.filter((event) => !settings.hiddenCalendars.includes(event.calendarId));
    const stored = storedGoogle(range.start, range.end);
    setEvents(visible(stored.events));
    if (stored.fresh) return;
    const controller = new AbortController();
    const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
    void fetch(`/api/google/events?start=${range.start}&end=${range.end}&tz=${tz}`, { signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() as Promise<{ events: GEvent[] }> : null))
      .then((payload) => {
        if (!payload) return;
        rememberGoogle(range.start, range.end, payload.events);
        setEvents(visible(storedGoogle(range.start, range.end).events));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [range.start, range.end, settings.showGoogle, settings.hiddenCalendars, googleGen]);

  useEffect(() => {
    const bump = () => setGoogleGen((value) => value + 1);
    window.addEventListener(GOOGLE_CHANGED, bump);
    return () => window.removeEventListener(GOOGLE_CHANGED, bump);
  }, []);

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
    if (mode !== "month") setMode("weeks");
  }

  function chooseMode(next: Mode) {
    setMode(next);
    setViewsOpen(false);
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

  if (narrow && mode === "focus") {
    return (
      <FocusCalendar
        anchor={anchor}
        tasks={data.tasks.filter((task) => !task.deletedAt)}
        openTasks={tasks}
        lists={lists}
        habits={alive(data.habits).filter((habit) => !habit.archivedAt).sort((a, b) => a.sort - b.sort)}
        checks={data.habitChecks}
        events={events}
        viewsOpen={viewsOpen}
        onViews={() => setViewsOpen((open) => !open)}
        onMode={chooseMode}
        onDay={setAnchor}
        onMenu={onMenu}
        onTask={openTask}
        onComplete={completeTask}
        onCheck={(habit) => {
          const count = checkFor(data.habitChecks, habit.id, anchor)?.count ?? 0;
          const done = count >= habit.goal;
          save("habitChecks", {
            id: habitCheckId(habit.id, anchor),
            habitId: habit.id,
            day: anchor,
            count: done ? 0 : count + 1,
            updatedAt: new Date().toISOString(),
          });
        }}
      />
    );
  }

  const label = mode === "day"
    ? parseDay(anchor).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    : parseDay(mode === "month" || mode === "weeks" ? visibleDay : mode === "week" ? startOfWeek(anchor) : anchor).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const grid = mode === "month" || mode === "weeks";

  return (
    <section className="stage cal-stage">
      <header>
        {narrow && (
          <button type="button" className="focus-glass" aria-label="Lists" onClick={onMenu}>
            <MenuIcon />
          </button>
        )}
        <h1>{label}</h1>
        <div className="cal-tools">
          {narrow && <button type="button" className="cal-chip back-focus" onClick={() => chooseMode("focus")}>Agenda</button>}
          <button type="button" className={detailed ? "cal-chip on density" : "cal-chip density"} onClick={() => setDetailed((value) => !value)}>Detailed</button>
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

function initialMode(): Mode {
  if (typeof window === "undefined") return "weeks";
  const phone = window.matchMedia(PHONE_QUERY).matches;
  const stored = window.sessionStorage.getItem(phone ? "slate-cal-phone" : "slate-cal-mode");
  const phoneModes: Mode[] = ["focus", "month", "week", "day", "agenda"];
  const desktopModes: Mode[] = ["month", "weeks", "week", "day", "agenda"];
  if (phone) return phoneModes.includes(stored as Mode) ? stored as Mode : "focus";
  return desktopModes.includes(stored as Mode) ? stored as Mode : "weeks";
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
    const board = el;
    let pinch = 0;
    let lastY = 0;
    let gestureScale = 1;
    function fingers(touches: TouchList) {
      const [a, b] = [touches[0], touches[1]];
      if (!a || !b) return null;
      return {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        y: (a.clientY + b.clientY) / 2,
      };
    }
    function wheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      onZoom(event.deltaY > 0 ? 1 : -1);
    }
    function touchStart(event: TouchEvent) {
      const point = fingers(event.touches);
      pinch = point?.distance ?? 0;
      lastY = point?.y ?? 0;
    }
    function touchMove(event: TouchEvent) {
      const point = fingers(event.touches);
      if (!point || pinch === 0) return;
      event.preventDefault();
      board.scrollTop -= point.y - lastY;
      lastY = point.y;
      const ratio = point.distance / pinch;
      if (ratio > 1.12) {
        onZoom(-1);
        pinch = point.distance;
      } else if (ratio < 0.89) {
        onZoom(1);
        pinch = point.distance;
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
    board.addEventListener("wheel", wheel, { passive: false });
    board.addEventListener("touchstart", touchStart, { passive: true });
    board.addEventListener("touchmove", touchMove, { passive: false });
    board.addEventListener("touchend", touchEnd);
    board.addEventListener("gesturestart", gestureStart);
    board.addEventListener("gesturechange", gestureChange);
    return () => {
      board.removeEventListener("wheel", wheel);
      board.removeEventListener("touchstart", touchStart);
      board.removeEventListener("touchmove", touchMove);
      board.removeEventListener("touchend", touchEnd);
      board.removeEventListener("gesturestart", gestureStart);
      board.removeEventListener("gesturechange", gestureChange);
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
    <aside className="cal-detail" role="dialog" aria-modal="true" aria-label={title}>
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

const PHONE_VIEWS: { mode: Mode; label: string }[] = [
  { mode: "month", label: "Month" },
  { mode: "week", label: "Week" },
  { mode: "day", label: "Day" },
  { mode: "agenda", label: "List" },
];

function FocusCalendar({
  anchor,
  tasks,
  openTasks,
  lists,
  habits,
  checks,
  events,
  viewsOpen,
  onViews,
  onMode,
  onDay,
  onMenu,
  onTask,
  onComplete,
  onCheck,
}: {
  anchor: string;
  tasks: TaskRecord[];
  openTasks: TaskRecord[];
  lists: ListRecord[];
  habits: HabitRecord[];
  checks: { habitId: string; day: string; count: number }[];
  events: GEvent[];
  viewsOpen: boolean;
  onViews: () => void;
  onMode: (mode: Mode) => void;
  onDay: (day: string) => void;
  onMenu?: () => void;
  onTask: (id: string) => void;
  onComplete: (task: TaskRecord) => void;
  onCheck: (habit: HabitRecord) => void;
}) {
  const [monthOpen, setMonthOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const pull = useRef<number | null>(null);
  const dayWord = anchor === today() ? "Today" : formatDay(anchor, today());
  const dayTasks = tasks
    .filter((task) => task.dueOn === anchor)
    .sort((a, b) => (a.completedAt ? 1 : 0) - (b.completedAt ? 1 : 0) || (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99") || a.sort - b.sort);
  const dayEvents = events.filter((event) => event.day === anchor);
  const marked = (day: string) => openTasks.some((task) => task.dueOn === day) || events.some((event) => event.day === day);

  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (event.currentTarget.scrollTop <= 0 && event.deltaY < -8) setMonthOpen(true);
    if (monthOpen && event.deltaY > 12) setMonthOpen(false);
  }

  return (
    <section className="stage cal-stage focus-stage">
      <header className="focus-head">
        <button type="button" className="focus-glass" aria-label="Lists" onClick={onMenu}>
          <MenuIcon />
        </button>
        <button type="button" className="focus-title" onClick={() => onDay(today())}>
          <strong>{parseDay(anchor).toLocaleDateString(undefined, { month: "long" })}</strong>
          <span>{dayWord}</span>
        </button>
        <div className="focus-capsule">
          <button type="button" aria-label="Month" onClick={() => onMode("month")}>
            <GridIcon />
          </button>
          <button type="button" aria-label="More views" aria-expanded={viewsOpen} onClick={onViews}>
            <DotsIcon />
          </button>
        </div>
      </header>
      {viewsOpen && (
        <div className="focus-menu" role="menu">
          {PHONE_VIEWS.map((item) => (
            <button key={item.mode} type="button" role="menuitem" onClick={() => onMode(item.mode)}>{item.label}</button>
          ))}
        </div>
      )}
      <div className="focus-cal">
        {monthOpen ? (
          <MonthStrip day={anchor} marked={marked} onDay={(day) => { onDay(day); setMonthOpen(false); }} />
        ) : (
          <WeekStrip day={anchor} marked={marked} onDay={onDay} />
        )}
        <button type="button" className="focus-grab" aria-label={monthOpen ? "Show week" : "Show month"} onClick={() => setMonthOpen((open) => !open)}>
          <i />
        </button>
      </div>
      <div
        className="focus-scroll"
        ref={scroller}
        onWheel={onWheel}
        onTouchStart={(event) => { pull.current = event.touches[0]?.clientY ?? null; }}
        onTouchEnd={(event) => {
          if (pull.current == null) return;
          const next = event.changedTouches[0]?.clientY ?? pull.current;
          const delta = next - pull.current;
          const atTop = (scroller.current?.scrollTop ?? 0) <= 0;
          if (atTop && delta > 36) setMonthOpen(true);
          if (delta < -36) setMonthOpen(false);
          pull.current = null;
        }}
      >
        <article className="focus-card">
          <h2>{dayWord}</h2>
          {dayTasks.length === 0 && dayEvents.length === 0 && <p className="focus-empty">Nothing scheduled</p>}
          {dayEvents.map((event) => (
            <div key={event.id} className="focus-row" style={{ ["--bar" as string]: event.color }}>
              <span className="focus-g">G</span>
              <span className="focus-name">{event.title}</span>
              <span className="focus-when"><span>{event.time ? formatTime(event.time) : dayWord}</span></span>
            </div>
          ))}
          {dayTasks.map((task) => {
            const color = lists.find((list) => list.id === task.listId)?.color ?? "var(--blue)";
            const done = Boolean(task.completedAt);
            return (
              <div key={task.id} className={done ? "focus-row dim" : "focus-row"} style={{ ["--bar" as string]: color }}>
                <button type="button" className={done ? "focus-check on" : "focus-check"} aria-label={done ? "Mark open" : "Complete"} onClick={() => onComplete(task)} />
                <button type="button" className="focus-name" onClick={() => onTask(task.id)}>{task.title}</button>
                <span className="focus-when">
                  <span>{task.dueTime ? formatTime(task.dueTime) : dayWord}</span>
                  {task.repeat && (
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8a4.8 4.8 0 0 1 8.1-3.5M12.8 8A4.8 4.8 0 0 1 4.7 11.5M11 3.2h1.8V5M5 12.8H3.2V11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                  )}
                </span>
              </div>
            );
          })}
        </article>
        {habits.length > 0 && (
          <article className="focus-card">
            <h2>Habit</h2>
            {habits.map((habit) => {
              const count = checks.find((check) => check.habitId === habit.id && check.day === anchor)?.count ?? 0;
              const done = count >= habit.goal;
              return (
                <button key={habit.id} type="button" className={done ? "focus-row dim" : "focus-row"} onClick={() => onCheck(habit)}>
                  <span className={done ? "focus-habit on" : "focus-habit"} style={{ color: habit.color }} />
                  <span className="focus-name">{habit.name}</span>
                  <span className="focus-when"><span>{dayWord}</span></span>
                </button>
              );
            })}
          </article>
        )}
      </div>
    </section>
  );
}

function WeekStrip({ day, marked, onDay }: { day: string; marked: (day: string) => boolean; onDay: (day: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const skip = useRef(false);
  const origin = startOfWeek(today());
  const weeks = useMemo(() => Array.from({ length: 105 }, (_, index) => addDays(origin, (index - 52) * 7)), [origin]);

  useLayoutEffect(() => {
    const el = scroller.current;
    const page = el?.querySelector<HTMLElement>(`[data-week="${startOfWeek(day)}"]`);
    if (!el || !page) return;
    skip.current = true;
    el.scrollLeft = page.offsetLeft;
    requestAnimationFrame(() => { skip.current = false; });
  }, [day]);

  function onScroll() {
    if (skip.current) return;
    const el = scroller.current;
    if (!el || el.clientWidth < 1) return;
    const start = weeks[Math.round(el.scrollLeft / el.clientWidth)];
    if (!start || start === startOfWeek(day)) return;
    onDay(addDays(start, parseDay(day).getDay()));
  }

  return (
    <div className="focus-strip" ref={scroller} onScroll={onScroll}>
      {weeks.map((start) => (
        <div key={start} className="focus-week" data-week={start}>
          {Array.from({ length: 7 }, (_, index) => addDays(start, index)).map((item, index) => (
            <DayCell key={item} day={item} selected={item === day} marked={marked(item)} showName weekLabel={index === 0 ? `W${sundayWeek(item)}` : ""} onPick={() => onDay(item)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function MonthStrip({ day, marked, onDay }: { day: string; marked: (day: string) => boolean; onDay: (day: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const skip = useRef(false);
  const current = `${today().slice(0, 7)}-01`;
  const months = useMemo(() => Array.from({ length: 49 }, (_, index) => addMonths(current, index - 24)), [current]);

  useLayoutEffect(() => {
    const el = scroller.current;
    const page = el?.querySelector<HTMLElement>(`[data-month="${day.slice(0, 7)}"]`);
    if (!el || !page) return;
    skip.current = true;
    el.scrollLeft = page.offsetLeft;
    requestAnimationFrame(() => { skip.current = false; });
  }, [day]);

  function onScroll() {
    if (skip.current) return;
    const el = scroller.current;
    if (!el || el.clientWidth < 1) return;
    const month = months[Math.round(el.scrollLeft / el.clientWidth)];
    if (!month || month.slice(0, 7) === day.slice(0, 7)) return;
    onDay(month === current ? today() : month);
  }

  return (
    <div className="focus-month">
      <div className="focus-dows">{["S", "M", "T", "W", "T", "F", "S"].map((label, index) => <span key={`${label}${index}`}>{label}</span>)}</div>
      <div className="focus-strip" ref={scroller} onScroll={onScroll}>
        {months.map((month) => {
          const origin = startOfWeek(month);
          return (
            <div key={month} className="focus-month-page" data-month={month.slice(0, 7)}>
              {Array.from({ length: 42 }, (_, index) => addDays(origin, index)).map((item) => (
                <DayCell key={item} day={item} selected={item === day} marked={marked(item)} outside={!item.startsWith(month.slice(0, 7))} showName={false} onPick={() => onDay(item)} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayCell({
  day,
  selected,
  marked,
  outside = false,
  showName = false,
  weekLabel = "",
  onPick,
}: {
  day: string;
  selected: boolean;
  marked: boolean;
  outside?: boolean;
  showName?: boolean;
  weekLabel?: string;
  onPick: () => void;
}) {
  const todayMark = day === today();
  return (
    <button type="button" className={["focus-day", selected ? "on" : "", outside ? "out" : "", todayMark ? "today" : ""].filter(Boolean).join(" ")} onClick={onPick}>
      {showName && <span>{parseDay(day).toLocaleDateString(undefined, { weekday: "narrow" })}</span>}
      <strong>{parseDay(day).getDate()}</strong>
      {marked ? <i /> : weekLabel ? <em>{weekLabel}</em> : <i className="clear" />}
    </button>
  );
}

function sundayWeek(value: string): number {
  const date = parseDay(value);
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const start = new Date(yearStart);
  start.setDate(1 - start.getDay());
  return 1 + Math.round((date.getTime() - start.getTime()) / 604_800_000);
}

function MenuIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M3 8h10M3 11.5h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function GridIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h3.2v3.2H3zM6.4 3h3.2v3.2H6.4zM9.8 3H13v3.2H9.8zM3 6.4h3.2v3.2H3zM6.4 6.4h3.2v3.2H6.4zM9.8 6.4H13v3.2H9.8zM3 9.8h3.2V13H3zM6.4 9.8h3.2V13H6.4zM9.8 9.8H13V13H9.8z" fill="none" stroke="currentColor" strokeWidth="1.1" /></svg>;
}

function DotsIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8h.01M8 8h.01M12 8h.01" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
}
