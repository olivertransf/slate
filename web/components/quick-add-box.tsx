"use client";

import { useMemo, useState } from "react";
import { formatDay, formatTime } from "@/lib/model";
import { parseQuickAdd } from "@/lib/quick-add";

export function QuickAddBox({
  value,
  onChange,
  onSubmit,
  today,
  placeholder = "Add task",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  today: string;
  placeholder?: string;
}) {
  const [ignored, setIgnored] = useState<string[]>([]);
  const parsed = useMemo(() => (value ? parseQuickAdd(value, today, ignored) : null), [value, today, ignored]);
  const hint = [parsed?.dueOn ? formatDay(parsed.dueOn, today) : "", parsed?.dueTime ? formatTime(parsed.dueTime) : ""]
    .filter(Boolean)
    .join(" · ");

  return (
    <form className="quick-form" onSubmit={onSubmit}>
      <span className="quick-plus" aria-hidden="true">
        <svg viewBox="0 0 16 16">
          <path d="M8 3.2v9.6M3.2 8h9.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </span>
      <div className="quick-box">
        <input
          aria-label="Add task"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
        />
      </div>
      {hint && (
        <button
          type="button"
          className="quick-parsed"
          onClick={() => {
            const date = parsed?.tokens.find((token) => token.kind === "date" || token.kind === "time");
            if (date) setIgnored((current) => [...current, date.text.toLowerCase()]);
          }}
        >
          {hint}
        </button>
      )}
    </form>
  );
}
