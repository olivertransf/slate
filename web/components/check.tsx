"use client";

export function Check({
  on,
  onClick,
  label = "Complete",
  quiet = false,
}: {
  on: boolean;
  onClick: () => void;
  label?: string;
  quiet?: boolean;
}) {
  const mark = (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.2 6.4 11.1 12.5 4.8" />
    </svg>
  );
  if (quiet) {
    return (
      <span className={on ? "check on" : "check"} onClick={(event) => { event.stopPropagation(); onClick(); }}>
        {mark}
      </span>
    );
  }
  return (
    <button type="button" className={on ? "check on" : "check"} aria-label={label} aria-pressed={on} onClick={onClick}>
      {mark}
    </button>
  );
}
