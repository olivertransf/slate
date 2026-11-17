"use client";

import { useState } from "react";
import { KINDS, SCHEMA_VERSION, dayISO, type Snapshot } from "@/lib/model";
import { sanitizeRecords } from "@/lib/records";
import { usePlanner } from "./planner-context";

export function BackupSettings() {
  const { data, saveBatch } = usePlanner();
  const [preview, setPreview] = useState<Partial<Snapshot> | null>(null);
  const [message, setMessage] = useState("");

  function exportBackup() {
    const payload = { format: "slate-backup", version: SCHEMA_VERSION, records: data };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `slate-backup-${dayISO(new Date())}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function readBackup(file: File) {
    setPreview(null);
    setMessage("");
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.format !== "slate-backup" || payload.version !== SCHEMA_VERSION ||
          !KINDS.every((kind) => Array.isArray(payload.records?.[kind]))) {
        throw new Error("Choose a Slate backup from this schema version.");
      }
      const result = sanitizeRecords(payload.records);
      if (result.rejected) throw new Error(`This backup has ${result.rejected} invalid records.`);
      setPreview(result.records);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read this backup.");
    }
  }

  const additions = KINDS.flatMap((kind) => {
    const ids = new Set(data[kind].map((record) => record.id));
    const records = new Map(preview?.[kind]?.map((record) => [record.id, record]) ?? []);
    return [...records.values()].filter((record) => !ids.has(record.id)).map((record) => ({ kind, record }));
  });

  return (
    <section>
      <h2>Planner backup</h2>
      <p className="hint">Download a copy of your planner records. Merging a backup adds missing records and keeps existing IDs, including deleted records.</p>
      <button className="primary" type="button" onClick={exportBackup}>Download backup</button>
      <label className="copy-row">
        <span>Preview a Slate backup</span>
        <input type="file" accept=".json,application/json" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readBackup(file);
          event.target.value = "";
        }} />
      </label>
      {preview && (
        <div className="settings-row">
          <span>{additions.length} new records ready to merge</span>
          <button className="text-button" type="button" disabled={!additions.length} onClick={() => {
            saveBatch(additions);
            setPreview(null);
            setMessage(`Added ${additions.length} records to the planner.`);
          }}>Merge</button>
          <button className="text-button" type="button" onClick={() => setPreview(null)}>Cancel</button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
