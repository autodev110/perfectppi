"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export function CommunityHelpfulButton({
  commentId,
  initialHelpful,
  initialCount,
  disabled = false,
}: {
  commentId: string;
  initialHelpful: boolean;
  initialCount: number;
  disabled?: boolean;
}) {
  const [helpful, setHelpful] = useState(initialHelpful);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busy || disabled) return;
    const next = !helpful;
    const previousHelpful = helpful;
    const previousCount = count;
    setHelpful(next);
    setCount(Math.max(0, count + (next ? 1 : -1)));
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/community/comments/${commentId}/helpful`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helpful: next }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not update Helpful");
      setHelpful(payload.data.helpful);
      setCount(payload.data.helpfulCount);
    } catch (caught) {
      setHelpful(previousHelpful);
      setCount(previousCount);
      setError(caught instanceof Error ? caught.message : "Could not update Helpful");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={toggle}
        disabled={busy || disabled}
        aria-pressed={helpful}
        aria-label={disabled ? `${count} Helpful marks` : helpful ? "Remove Helpful mark" : "Mark answer Helpful"}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors",
          helpful ? "bg-teal/10 text-teal" : "text-on-surface-variant hover:bg-surface-container-high",
          disabled && "cursor-default opacity-70",
        )}
      >
        <Wrench className="h-3.5 w-3.5" />
        <span>Helpful{count > 0 ? ` ${count}` : ""}</span>
      </button>
      {error ? <p className="mt-1 text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
