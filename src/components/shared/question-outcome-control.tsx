"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";

export type QuestionOutcome = "fixed" | "helped" | "not_fixed" | "still_diagnosing";

const OUTCOMES: Array<{ value: QuestionOutcome; label: string }> = [
  { value: "fixed", label: "Fixed the issue" },
  { value: "helped", label: "Helped, but did not fully solve it" },
  { value: "not_fixed", label: "Did not fix it" },
  { value: "still_diagnosing", label: "Still diagnosing" },
];

export function questionOutcomeLabel(outcome: QuestionOutcome | null) {
  return OUTCOMES.find((item) => item.value === outcome)?.label ?? null;
}

export function QuestionOutcomeControl({
  postId,
  initialOutcome,
  hasAcceptedAnswer,
  canManage,
}: {
  postId: string;
  initialOutcome: QuestionOutcome | null;
  hasAcceptedAnswer: boolean;
  canManage: boolean;
}) {
  const [outcome, setOutcome] = useState<QuestionOutcome | null>(initialOutcome);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = questionOutcomeLabel(outcome);

  async function update(next: QuestionOutcome | null) {
    if (busy) return;
    const previous = outcome;
    setOutcome(next);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/community/posts/${postId}/outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: next }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not update outcome");
      setOutcome(payload.data.outcome);
    } catch (caught) {
      setOutcome(previous);
      setError(caught instanceof Error ? caught.message : "Could not update outcome");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return label ? (
      <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal/10 px-3 py-2 text-sm font-semibold text-teal">
        <CheckCircle2 className="h-4 w-4" />
        Outcome: {label}
      </div>
    ) : null;
  }

  if (!hasAcceptedAnswer) {
    return <p className="mt-4 text-xs text-on-surface-variant">Accept an answer to record what solved the issue.</p>;
  }

  return (
    <div className="mt-4 rounded-xl bg-surface-container px-3 py-3 ghost-border">
      <label htmlFor={`question-outcome-${postId}`} className="mb-1 block text-xs font-bold text-on-surface">
        Did the accepted answer solve it?
      </label>
      <select
        id={`question-outcome-${postId}`}
        value={outcome ?? ""}
        disabled={busy}
        onChange={(event) => void update((event.target.value || null) as QuestionOutcome | null)}
        className="min-h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
      >
        <option value="">Choose an outcome</option>
        {OUTCOMES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      {busy ? <p className="mt-1 text-xs text-on-surface-variant">Saving outcome...</p> : null}
      {error ? <p className="mt-1 text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
