"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { CommunityPollView } from "@/features/community/queries";

// Poll (plan 14.2): one vote per member, changeable until close; counts show
// only after the viewer votes or the poll closes. Voter identities are
// never available to the client.
export function CommunityPoll({ postId, initial }: { postId: string; initial: CommunityPollView }) {
  const [poll, setPoll] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revealed = poll.closed || poll.viewer_option_key !== null;

  async function vote(optionKey: string) {
    if (busy || poll.closed) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/community/posts/${postId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionKey }),
      });
      const payload = (await response.json().catch(() => null)) as { data?: { closesAt: string; closed: boolean; totalVotes: number; viewerOptionKey: string | null; options: CommunityPollView["options"] }; error?: string } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error ?? "The vote could not be recorded.");
      setPoll({
        closes_at: payload.data.closesAt,
        closed: payload.data.closed,
        total_votes: payload.data.totalVotes,
        viewer_option_key: payload.data.viewerOptionKey,
        options: payload.data.options,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The vote could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2" role="group" aria-label="Poll">
      {poll.options.map((option) => {
        const share = revealed && poll.total_votes > 0 && option.votes !== null ? Math.round((option.votes / poll.total_votes) * 100) : 0;
        const mine = poll.viewer_option_key === option.key;
        return (
          <button
            key={option.key}
            type="button"
            disabled={busy || poll.closed}
            onClick={() => vote(option.key)}
            aria-pressed={mine}
            className={cn(
              "relative w-full overflow-hidden rounded-xl border px-4 py-2.5 text-left text-sm transition-colors",
              mine ? "border-primary" : "border-outline-variant/30 hover:bg-surface-container",
              poll.closed ? "cursor-default" : "",
            )}
          >
            {revealed ? <span className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${share}%` }} aria-hidden /> : null}
            <span className="relative flex items-center justify-between gap-3">
              <span className={cn("font-semibold", mine ? "text-primary" : "text-on-surface")}>{option.label}</span>
              {revealed ? <span className="text-xs font-bold text-on-surface-variant">{share}%{option.votes !== null ? ` · ${option.votes}` : ""}</span> : null}
            </span>
          </button>
        );
      })}
      <p className="text-xs text-on-surface-variant">
        {poll.total_votes} vote{poll.total_votes === 1 ? "" : "s"} · {poll.closed ? "Closed" : `Closes ${new Date(poll.closes_at).toLocaleString()}`}
        {!revealed && !poll.closed ? " · Vote to see results" : ""}
      </p>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
