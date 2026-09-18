"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

import { useTranslator } from "@/lib/i18n/client";

export function CommunityLikeButton({
  postId,
  initialLiked,
  initialCount,
  disabled = false,
}: {
  postId: string;
  initialLiked: boolean;
  initialCount: number;
  disabled?: boolean;
}) {
  const uiText = useTranslator();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busy || disabled) return;
    const nextLiked = !liked;
    const previousLiked = liked;
    const previousCount = count;
    setLiked(nextLiked);
    setCount(Math.max(0, count + (nextLiked ? 1 : -1)));
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/community/posts/${postId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liked: nextLiked }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? uiText("ui.could_not_update_like_3e4642f81d"));
      setLiked(payload.data.liked);
      setCount(payload.data.likeCount);
    } catch (caught) {
      setLiked(previousLiked);
      setCount(previousCount);
      setError(caught instanceof Error ? caught.message : uiText("ui.could_not_update_like_3e4642f81d"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy || disabled}
        aria-pressed={liked}
        aria-label={disabled ? uiText("ui.likes_411935c69d", { arg0: String(count) }) : liked ? uiText("ui.unlike_post_6b51363be8") : uiText("ui.like_post_0b310074a0")}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold transition-colors",
          liked ? "text-red-600" : "text-on-surface-variant hover:bg-surface-container-high",
          disabled && "cursor-default opacity-70",
        )}
      >
        <Heart className={cn("h-4 w-4", liked && "fill-current")} />
        <span>{count}</span>
      </button>
      {error ? <p className="mt-1 text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
