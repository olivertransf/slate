"use client";

import { useEffect, useRef, type FormEventHandler, type ReactNode } from "react";

export function AddSheet({ label, onClose, onSubmit, children }: {
  label: string;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    element?.querySelector("input")?.focus();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} className="add-sheet" aria-label={label}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="sheet-card" onSubmit={onSubmit}>
        <div className="sheet-heading">
          <h2>{label}</h2>
          <button className="action-trigger" type="button" aria-label="Close" onClick={onClose}>×</button>
        </div>
        {children}
      </form>
    </dialog>
  );
}
