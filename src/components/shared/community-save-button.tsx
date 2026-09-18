"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

import { useTranslator } from "@/lib/i18n/client";

// One-tap private Save/Unsave (plan Phase 1B). Optimistic like the like
// button; reconciles to the server's answer and rolls back on failure.
export function CommunitySaveButton({
  postId,
  initialSaved,
  compact = false,
}: {
  postId: string;
  initialSaved: boolean;
  compact?: boolean;
}) {
  const uiText = useTranslator();
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
      const response = await fetch(`/api/community/posts/${postId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saved: next }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? uiText("ui.could_not_update_save_f09cba526c"));
      setSaved(payload.data.saved);
    } catch (caught) {
      setSaved(previous);
      setError(caught instanceof Error ? caught.message : uiText("ui.could_not_update_save_f09cba526c"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        aria-label={saved ? uiText("ui.remove_from_saved_4115ec23ac") : uiText("ui.save_post_f1142baaa3")}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold transition-colors",
          saved ? "text-primary" : "text-on-surface-variant hover:bg-surface-container-high",
        )}
      >
        <Bookmark className={cn("h-4 w-4", saved && "fill-current")} />
        {compact ? null : <span>{saved ? uiText("ui.saved_b5c120b316") : uiText("ui.save_1509f561f2")}</span>}
      </button>
      {error ? <p className="mt-1 text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
