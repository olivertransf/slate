"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const MENU_ITEM = "[role^='menuitem']";

export type ActionItem = {
  label: string;
  action?: () => void;
  children?: ActionItem[];
  checked?: boolean;
  danger?: boolean;
  divider?: boolean;
  shortcut?: string;
};

export function ActionMenu({ label, icon, items, className = "", contextPoint, onContextClose }: {
  label: string;
  icon: ReactNode;
  items: ActionItem[];
  className?: string;
  contextPoint?: { x: number; y: number } | null;
  onContextClose?: () => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<"first" | "last">("first");
  const [expanded, setExpanded] = useState(false);
  const [path, setPath] = useState<ActionItem[]>([]);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const open = expanded || Boolean(contextPoint);
  const current = path.at(-1)?.children ?? items;

  function close(restoreFocus = false) {
    setExpanded(false);
    setPath([]);
    onContextClose?.();
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  useLayoutEffect(() => {
    if (!open || !panel.current || !trigger.current) return;
    const box = trigger.current.getBoundingClientRect();
    const menu = panel.current.getBoundingClientRect();
    const x = contextPoint?.x ?? box.right - menu.width;
    const y = contextPoint?.y ?? box.bottom + 6;
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - menu.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - menu.height - 8)),
    });
    const buttons = [...panel.current.querySelectorAll<HTMLButtonElement>(MENU_ITEM)];
    const target = initialFocus.current === "last" ? buttons.at(-1) : buttons[0];
    target?.focus();
    initialFocus.current = "first";
  }, [open, path, contextPoint]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      const node = event.target as Node;
      if (!panel.current?.contains(node) && !trigger.current?.contains(node)) close();
    }
    function dismiss() { close(); }
    function scrolled(event: Event) {
      if (!panel.current?.contains(event.target as Node)) close();
    }
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", scrolled, true);
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" className={`action-trigger ${className}`} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); if (open) close(); else setExpanded(true); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          initialFocus.current = event.key === "ArrowUp" ? "last" : "first";
          setExpanded(true);
        }
      }}>{icon}</button>
    {open && createPortal(<div ref={panel} id={id} role="menu" aria-label={path.at(-1)?.label ?? label} className="action-menu" style={position}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        event.stopPropagation();
        const buttons = [...(panel.current?.querySelectorAll<HTMLButtonElement>(MENU_ITEM) ?? [])];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "Escape") { event.preventDefault(); close(true); }
        else if (event.key === "Tab") close(true);
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const next = index === -1 ? (event.key === "ArrowDown" ? 0 : buttons.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault(); (event.key === "Home" ? buttons[0] : buttons.at(-1))?.focus();
        } else if (event.key === "ArrowLeft" && path.length) { event.preventDefault(); setPath((value) => value.slice(0, -1)); }
        else if (event.key === "ArrowRight" && document.activeElement?.getAttribute("aria-haspopup") === "menu") { event.preventDefault(); (document.activeElement as HTMLButtonElement).click(); }
      }}>
      {path.length > 0 && <button type="button" role="menuitem" className="menu-back" onClick={() => setPath((value) => value.slice(0, -1))}>‹ {path.at(-1)?.label}</button>}
      {current.map((item, index) => <div key={`${index}:${item.label}`} role="none">
        {item.divider && <div className="menu-divider" role="separator" />}
        <button type="button" role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"} tabIndex={-1}
          aria-checked={item.checked} className={item.danger ? "menu-danger" : ""} aria-haspopup={item.children ? "menu" : undefined}
          onClick={() => { if (item.children) setPath((value) => [...value, item]); else { close(true); item.action?.(); } }}>
          <span className="menu-check" aria-hidden="true">{item.checked ? "✓" : ""}</span><span>{item.label}</span>
          {item.children ? <span className="menu-key">›</span> : item.shortcut ? <kbd className="menu-key">{item.shortcut}</kbd> : null}
        </button>
      </div>)}
    </div>, document.body)}
  </>;
}
