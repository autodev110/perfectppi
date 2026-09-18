"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { useTranslator } from "@/lib/i18n/client";

// Author edit / remove for the viewer's own post or comment (plan 14.6, 15.1).
// Edit swaps the rendered text for an inline textarea; saving publishes a new
// revision through the API and the page re-renders from the server so the
// "Edited" label, mentions, and counts stay canonical. Remove (comments only)
// is a soft archive and asks first.
export function CommunityAuthorEditor({
  entityType,
  entityId,
  initialContent,
  canRemove = false,
  className,
  children,
}: {
  entityType: "post" | "comment";
  entityId: string;
  initialContent: string;
  canRemove?: boolean;
  className?: string;
  /** The rendered read-only content (mention-aware); shown when not editing. */
  children: React.ReactNode;
}) {
  const uiText = useTranslator();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxLength = entityType === "post" ? 1200 : 600;
  const endpoint = entityType === "post"
    ? `/api/community/posts/${entityId}`
    : `/api/community/comments/${entityId}`;
  const noun = entityType === "post" ? "post" : "comment";

  async function save() {
    const trimmed = content.trim();
    if (busy || trimmed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? uiText("ui.could_not_save_your_38fec742dd", { arg0: String(noun) }));
      setEditing(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText("ui.could_not_save_your_38fec742dd", { arg0: String(noun) }));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    if (!window.confirm(uiText("ui.remove_this_comment_replies_to_it_stay_visib_4f0304457c"))) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? uiText("ui.could_not_remove_your_comment_b3803b391c"));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText("ui.could_not_remove_your_comment_b3803b391c"));
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className={cn("space-y-2", className)}>
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={entityType === "post" ? 5 : 3}
          maxLength={maxLength}
          aria-label={uiText("ui.edit_your_9370c3be41", { arg0: String(noun) })}
          disabled={busy}
          autoFocus
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={save} disabled={busy || content.trim().length === 0}>
            {busy ? uiText("ui.saving_23e39291d6") : uiText("ui.save_1509f561f2")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => { setEditing(false); setContent(initialContent); setError(null); }}
            disabled={busy}
          >{uiText("ui.cancel_19766ed6cc")}</Button>
          {content.length > maxLength - 100 ? (
            <span className="text-xs text-on-surface-variant">{content.length}/{maxLength}</span>
          ) : null}
        </div>
        {error ? <p role="alert" className="text-xs text-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={className}>
      {children}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => { setContent(initialContent); setError(null); setEditing(true); }}
          disabled={busy}
          className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
          aria-label={uiText("ui.edit_your_9370c3be41", { arg0: String(noun) })}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />{uiText("ui.edit_464c4ffd01")}</button>
        {canRemove ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-on-surface-variant hover:bg-surface-container hover:text-error"
            aria-label={uiText("ui.remove_your_comment_2792763f6f")}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />{uiText("ui.remove_c3812fc4ac")}</button>
        ) : null}
        {error ? <span role="alert" className="text-xs text-error">{error}</span> : null}
      </div>
    </div>
  );
}
