"use client";

import { useState } from "react";
import type { NotificationPreference } from "@/features/notifications/preferences";
import { cn } from "@/lib/utils";

// Per-category in-app/push switches (plan 22.1). Locked categories render
// as always-on. Each change saves immediately and rolls back on failure.
export function NotificationPreferencesForm({ initial }: { initial: NotificationPreference[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(category: string, field: "in_app" | "push", value: boolean) {
    const previous = rows;
    const next = rows.map((row) => (row.category === category ? { ...row, [field]: value } : row));
    const target = next.find((row) => row.category === category);
    if (!target) return;
    setRows(next);
    setBusy(`${category}:${field}`);
    setError(null);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, inApp: target.in_app, push: target.push }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Could not save");
      }
    } catch (caught) {
      setRows(previous);
      setError(caught instanceof Error ? caught.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-3 text-sm">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Category</span>
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">In-app</span>
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Push</span>
        {rows.map((row) => (
          <RowFragment key={row.category} row={row} busy={busy} onChange={update} />
        ))}
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">
        Safety, moderation, and account notices are always delivered so you never miss a decision about your content or your account.
      </p>
    </div>
  );
}

function RowFragment({
  row,
  busy,
  onChange,
}: {
  row: NotificationPreference;
  busy: string | null;
  onChange: (category: string, field: "in_app" | "push", value: boolean) => void;
}) {
  const disabled = row.locked;
  return (
    <>
      <div className="min-w-0">
        <p className="font-semibold">{row.label}</p>
        <p className="text-xs text-muted-foreground">{row.description}</p>
      </div>
      {(["in_app", "push"] as const).map((field) => (
        <label key={field} className={cn("flex items-center justify-center", disabled && "opacity-60")}>
          <input
            type="checkbox"
            className="h-4 w-4 rounded"
            checked={row[field]}
            disabled={disabled || busy === `${row.category}:${field}`}
            onChange={(event) => onChange(row.category, field, event.target.checked)}
            aria-label={`${row.label} ${field === "in_app" ? "in-app" : "push"} notifications`}
          />
        </label>
      ))}
    </>
  );
}
