"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Reply to a top-level comment (plan 15.1, one level deep). Collapsed to a
// "Reply" control until tapped; the reply publishes through the comments API
// with the parent id and the page re-renders from the server.
export function CommunityReplyForm({
  postId,
  parentCommentId,
  replyingTo,
}: {
  postId: string;
  parentCommentId: string;
  replyingTo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = content.trim();
    if (busy || trimmed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed, parentCommentId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Could not post your reply");
      if (payload.data?.moderationStatus && payload.data.moderationStatus !== "active") {
        setError(payload.data.moderationMessage ?? "Your reply is being reviewed and is not public yet.");
        setContent("");
        setOpen(false);
        return;
      }
      setContent("");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not post your reply");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
          aria-label={`Reply to ${replyingTo}`}
        >
          <CornerDownRight className="h-3.5 w-3.5" aria-hidden />
          Reply
        </button>
        {error ? <p role="alert" className="mt-1 text-xs text-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-on-surface-variant">Replying to {replyingTo}</p>
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={2}
        maxLength={600}
        placeholder="Write a reply…"
        aria-label={`Reply to ${replyingTo}`}
        disabled={busy}
        autoFocus
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={busy || content.trim().length === 0}>
          {busy ? "Posting…" : "Post reply"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setContent(""); setError(null); }} disabled={busy}>
          Cancel
        </Button>
      </div>
      {error ? <p role="alert" className="text-xs text-error">{error}</p> : null}
    </div>
  );
}
