"use client";

import { useSyncExternalStore } from "react";

export type UiSettings = {
  scale: number;
  sidebar: number;
  detail: number;
  showGoogle: boolean;
  hiddenCalendars: string[];
  calWeeks: number;
};

export const UI_DEFAULTS: UiSettings = {
  scale: 1,
  sidebar: 220,
  detail: 360,
  showGoogle: true,
  hiddenCalendars: [],
  calWeeks: 4,
};

const KEY = "slate-ui";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitize(value: Partial<UiSettings> | null): UiSettings {
  return {
    scale: clamp(Number(value?.scale) || 1, 0.8, 1.4),
    sidebar: clamp(Number(value?.sidebar) || 220, 180, 420),
    detail: clamp(Number(value?.detail) || 360, 280, 640),
    showGoogle: value?.showGoogle !== false,
    hiddenCalendars: Array.isArray(value?.hiddenCalendars) ? value.hiddenCalendars.filter((id) => typeof id === "string") : [],
    calWeeks: clamp(Math.round(Number(value?.calWeeks) || 4), 1, 8),
  };
}

function read(): UiSettings {
  if (typeof window === "undefined") return UI_DEFAULTS;
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<UiSettings> | null);
  } catch {
    return UI_DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function patchUi(partial: Partial<UiSettings>) {
  current = sanitize({ ...current, ...partial });
  localStorage.setItem(KEY, JSON.stringify(current));
  document.documentElement.style.setProperty("--ui-scale", String(current.scale));
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUiSettings(): UiSettings {
  return useSyncExternalStore(subscribe, () => current, () => UI_DEFAULTS);
}
