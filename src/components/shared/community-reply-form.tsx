"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useTranslator } from "@/lib/i18n/client";

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
  const uiText = useTranslator();
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
      if (!response.ok) throw new Error(payload.error ?? uiText("ui.could_not_post_your_reply_c3150f8d4b"));
      if (payload.data?.moderationStatus && payload.data.moderationStatus !== "active") {
        setError(payload.data.moderationMessage ?? uiText("ui.your_reply_is_being_reviewed_and_is_not_publ_6a92d8a618"));
        setContent("");
        setOpen(false);
        return;
      }
      setContent("");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText("ui.could_not_post_your_reply_c3150f8d4b"));
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
          aria-label={uiText("ui.reply_to_e50f672c9e", { arg0: String(replyingTo) })}
        >
          <CornerDownRight className="h-3.5 w-3.5" aria-hidden />{uiText("ui.reply_c253f451bd")}</button>
        {error ? <p role="alert" className="mt-1 text-xs text-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-on-surface-variant">{uiText("ui.replying_to_3d393bf19a")}{replyingTo}</p>
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={2}
        maxLength={600}
        placeholder={uiText("ui.write_a_reply_182fe0aac9")}
        aria-label={uiText("ui.reply_to_e50f672c9e", { arg0: String(replyingTo) })}
        disabled={busy}
        autoFocus
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={busy || content.trim().length === 0}>
          {busy ? uiText("ui.posting_648a2ef491") : uiText("ui.post_reply_860e367626")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setContent(""); setError(null); }} disabled={busy}>{uiText("ui.cancel_19766ed6cc")}</Button>
      </div>
      {error ? <p role="alert" className="text-xs text-error">{error}</p> : null}
    </div>
  );
}
