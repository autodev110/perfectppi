"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

// Private Save/Unsave for a marketplace listing (plan 25.2). Optimistic,
// reconciled to the server, rolled back on failure. Sellers never see saves.
export function ListingSaveButton({
  listingId,
  initialSaved,
  variant = "overlay",
}: {
  listingId: string;
  initialSaved: boolean;
  variant?: "overlay" | "inline";
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    const previous = saved;
    const next = !saved;
    setSaved(next);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/marketplace/listings/${listingId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saved: next }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not update save");
      setSaved(payload.data.saved);
    } catch (caught) {
      setSaved(previous);
      setError(caught instanceof Error ? caught.message : "Could not update save");
    } finally {
      setBusy(false);
    }
  }

  if (variant === "overlay") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        aria-label={saved ? "Remove listing from saved" : "Save listing"}
        title={error ?? undefined}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm transition-colors",
          saved ? "text-primary" : "text-on-surface-variant hover:text-primary",
        )}
      >
        <Bookmark className={cn("h-4 w-4", saved && "fill-current")} />
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        aria-label={saved ? "Remove listing from saved" : "Save listing"}
        className={cn(
          "inline-flex min-h-10 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors",
          saved ? "border-primary text-primary" : "border-outline-variant/40 text-on-surface-variant hover:bg-surface-container",
        )}
      >
        <Bookmark className={cn("h-4 w-4", saved && "fill-current")} />
        {saved ? "Saved" : "Save"}
      </button>
      {error ? <p className="mt-1 text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
