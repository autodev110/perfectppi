"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

import { useTranslator } from "@/lib/i18n/client";

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
  const uiText = useTranslator();
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
      if (!response.ok) throw new Error(payload.error ?? uiText("ui.could_not_update_helpful_c1481c2b76"));
      setHelpful(payload.data.helpful);
      setCount(payload.data.helpfulCount);
    } catch (caught) {
      setHelpful(previousHelpful);
      setCount(previousCount);
      setError(caught instanceof Error ? caught.message : uiText("ui.could_not_update_helpful_c1481c2b76"));
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
        aria-label={disabled ? uiText("ui.helpful_marks_ff06aa3f21", { arg0: String(count) }) : helpful ? uiText("ui.remove_helpful_mark_c09b1162d8") : uiText("ui.mark_answer_helpful_11036a57fe")}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors",
          helpful ? "bg-teal/10 text-teal" : "text-on-surface-variant hover:bg-surface-container-high",
          disabled && "cursor-default opacity-70",
        )}
      >
        <Wrench className="h-3.5 w-3.5" />
        <span>{uiText("ui.helpful_63c432db3e")}{count > 0 ? uiText("ui.text_b5b1423ad2", { arg0: String(count) }) : ""}</span>
      </button>
      {error ? <p className="mt-1 text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
