"use client";

import { useState } from "react";
import { CheckCircle2, History } from "lucide-react";

export type QuestionOutcome = "fixed" | "helped" | "not_fixed" | "still_diagnosing";
type QuestionOutcomeHistoryItem = {
  id: string;
  previous_outcome: QuestionOutcome | null;
  outcome: QuestionOutcome | null;
  created_at: string;
  applies_to_current_answer: boolean;
};

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
  const [historyVersion, setHistoryVersion] = useState(0);
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
      setHistoryVersion((version) => version + 1);
    } catch (caught) {
      setOutcome(previous);
      setError(caught instanceof Error ? caught.message : "Could not update outcome");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return (
      <div className="mt-4 space-y-2">
        {label ? (
          <div className="inline-flex items-center gap-2 rounded-xl bg-teal/10 px-3 py-2 text-sm font-semibold text-teal">
            <CheckCircle2 className="h-4 w-4" />
            Outcome: {label}
          </div>
        ) : null}
        <QuestionOutcomeHistory key={historyVersion} postId={postId} />
      </div>
    );
  }

  if (!hasAcceptedAnswer) {
    return (
      <div className="mt-4 space-y-2">
        <p className="text-xs text-on-surface-variant">Accept an answer to record what solved the issue.</p>
        <QuestionOutcomeHistory key={historyVersion} postId={postId} />
      </div>
    );
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
      <QuestionOutcomeHistory key={historyVersion} postId={postId} />
    </div>
  );
}

function QuestionOutcomeHistory({ postId }: { postId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<QuestionOutcomeHistoryItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (!next || history !== null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/community/posts/${postId}/outcome`, {
        cache: "no-store",
      });
      const payload = await response.json() as { data?: QuestionOutcomeHistoryItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load outcome history");
      setHistory(payload.data ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load outcome history");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-expanded={expanded}
        className="inline-flex min-h-10 items-center gap-2 font-semibold text-primary hover:underline"
      >
        <History className="h-4 w-4" />
        {expanded ? "Hide outcome history" : "View outcome history"}
      </button>
      {expanded ? (
        <div className="mt-2 rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
          {busy ? <p role="status" className="text-on-surface-variant">Loading outcome history...</p> : null}
          {error ? <p role="alert" className="text-destructive">{error}</p> : null}
          {history?.length === 0 ? <p className="text-on-surface-variant">No outcome changes yet.</p> : null}
          {history?.length ? (
            <ol className="space-y-3">
              {history.map((event) => (
                <li key={event.id} className="border-l-2 border-primary/30 pl-3">
                  <p className="font-semibold text-on-surface">
                    {event.outcome ? `Changed to ${questionOutcomeLabel(event.outcome)}` : "Cleared the outcome"}
                  </p>
                  <p className="text-on-surface-variant">
                    {formatOutcomeHistoryDate(event.created_at)}
                    {event.previous_outcome ? ` · Previously ${questionOutcomeLabel(event.previous_outcome)}` : ""}
                  </p>
                  {!event.applies_to_current_answer ? <p className="text-on-surface-variant">For an earlier accepted answer</p> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatOutcomeHistoryDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
