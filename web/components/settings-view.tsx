"use client";

import { useEffect, useState } from "react";
import { patchUi, useUiSettings } from "@/lib/ui-settings";

type CalendarInfo = { id: string; name: string; color: string; primary: boolean };
type Status = { configured: boolean; connected: boolean; calendars: CalendarInfo[] };

export function SettingsView({ notice }: { notice: string | null }) {
  const settings = useUiSettings();
  const [status, setStatus] = useState<Status | null>(null);
  const [redirect, setRedirect] = useState("");

  useEffect(() => {
    setRedirect(`${window.location.origin}/api/google/callback`);
    void fetch("/api/google/status")
      .then((response) => response.json())
      .then((payload: Status) => setStatus(payload))
      .catch(() => setStatus({ configured: false, connected: false, calendars: [] }));
  }, []);

  async function disconnect() {
    await fetch("/api/google/logout", { method: "POST" });
    setStatus((current) => current ? { ...current, connected: false, calendars: [] } : current);
  }

  function toggleCalendar(id: string, shown: boolean) {
    const hidden = settings.hiddenCalendars.filter((item) => item !== id);
    patchUi({ hiddenCalendars: shown ? hidden : [...hidden, id] });
  }

  return (
    <section className="stage settings">
      <header>
        <h1>Settings</h1>
      </header>
      <div className="settings-body">
        {notice && <p className="settings-note">{notice}</p>}
        <section>
          <h2>Google Calendar</h2>
          <p className="hint">Sign in once. The same Google Calendar then shows on the website, iPhone, and iPad. Add these in Google Cloud, on this OAuth client, before the first login from a new address.</p>
          <label className="copy-row">
            <span>Authorized JavaScript origin</span>
            <input readOnly value={redirect ? new URL(redirect).origin : ""} onFocus={(event) => event.currentTarget.select()} />
          </label>
          <label className="copy-row">
            <span>Authorized redirect URI</span>
            <input readOnly value={redirect} onFocus={(event) => event.currentTarget.select()} />
          </label>
          {status?.connected ? (
            <div className="settings-row">
              <span>Signed in{status.calendars.find((item) => item.primary) ? ` as ${status.calendars.find((item) => item.primary)?.name}` : ""}</span>
              <button type="button" className="text-button" onClick={() => void disconnect()}>Sign out</button>
            </div>
          ) : (
            <a className="primary settings-login" href="/api/google/start">Sign in with Google</a>
          )}
          {status && !status.configured && <p className="hint">The server is missing the Google client.</p>}
          {status?.connected && (
            <div className="settings-calendars">
              <label className="check-row">
                <input type="checkbox" checked={settings.showGoogle} onChange={(event) => patchUi({ showGoogle: event.target.checked })} />
                Show events on the calendar
              </label>
              {status.calendars.map((calendar) => {
                const on = !settings.hiddenCalendars.includes(calendar.id);
                return (
                  <label key={calendar.id} className="check-row">
                    <input type="checkbox" checked={on} onChange={() => toggleCalendar(calendar.id, !on)} />
                    <i className="count-dot" style={{ background: calendar.color }} />
                    <span>{calendar.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </section>
        <section>
          <h2>Layout</h2>
          <label className="slider-row">
            <span>Scale {Math.round(settings.scale * 100)}%</span>
            <input
              type="range"
              min={80}
              max={140}
              value={Math.round(settings.scale * 100)}
              onChange={(event) => patchUi({ scale: Number(event.target.value) / 100 })}
            />
          </label>
          <label className="slider-row">
            <span>Sidebar {settings.sidebar}px</span>
            <input type="range" min={180} max={420} value={settings.sidebar} onChange={(event) => patchUi({ sidebar: Number(event.target.value) })} />
          </label>
          <label className="slider-row">
            <span>Task details {settings.detail}px</span>
            <input type="range" min={280} max={640} value={settings.detail} onChange={(event) => patchUi({ detail: Number(event.target.value) })} />
          </label>
          <p className="hint">You can also drag the edges of the sidebar and the task details.</p>
        </section>
      </div>
    </section>
  );
}
