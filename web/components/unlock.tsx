"use client";

import { useState } from "react";
import { usePlanner } from "./planner-context";

export function Unlock() {
  const { unlock } = usePlanner();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <main className="unlock">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          void unlock(passphrase).then((message) => {
            setError(message);
            setPending(false);
          });
        }}
      >
        <div className="mark">S</div>
        <h1>Slate</h1>
        <p>Tasks, calendar, habits, and countdowns, synced across your devices.</p>
        <label className="field" style={{ display: "block", margin: "18px 0 8px" }}>
          <span className="hint">Passphrase</span>
          <input
            style={{ marginTop: 6 }}
            type="password"
            autoFocus
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <p className="error">{error}</p>
        <button type="submit" disabled={pending || passphrase.length === 0}>
          {pending ? "Unlocking" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
