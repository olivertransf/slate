"use client";

import { useMemo, useState } from "react";
import { formatDay, formatTime } from "@/lib/model";
import { parseQuickAdd, type QuickToken, type TokenKind } from "@/lib/quick-add";

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
  const parsed = useMemo(() => parseQuickAdd(value, today, ignored), [value, today, ignored]);
  const pieces = useMemo(() => split(value, parsed.tokens), [value, parsed.tokens]);
  const hint = [parsed.dueOn ? formatDay(parsed.dueOn, today) : "", parsed.dueTime ? formatTime(parsed.dueTime) : ""]
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
        <div className="mirror" aria-hidden="true">
          {pieces.map((piece, index) =>
            piece.kind ? (
              <mark key={index} className={`tok ${piece.kind}`}>
                {piece.text}
              </mark>
            ) : (
              <span key={index}>{piece.text}</span>
            ),
          )}
          {value.length === 0 ? "\u200b" : null}
        </div>
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
            const date = parsed.tokens.find((token) => token.kind === "date" || token.kind === "time");
            if (date) setIgnored((current) => [...current, date.text.toLowerCase()]);
          }}
        >
          {hint}
        </button>
      )}
    </form>
  );
}

function split(value: string, tokens: QuickToken[]): { text: string; kind: TokenKind | null }[] {
  const pieces: { text: string; kind: TokenKind | null }[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start > cursor) pieces.push({ text: value.slice(cursor, token.start), kind: null });
    pieces.push({ text: value.slice(token.start, token.end), kind: token.kind });
    cursor = token.end;
  }
  if (cursor < value.length) pieces.push({ text: value.slice(cursor), kind: null });
  if (pieces.length === 0) pieces.push({ text: value, kind: null });
  return pieces;
}
