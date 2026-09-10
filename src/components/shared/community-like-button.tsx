"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

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
      if (!response.ok) throw new Error(payload.error ?? "Could not update like");
      setLiked(payload.data.liked);
      setCount(payload.data.likeCount);
    } catch (caught) {
      setLiked(previousLiked);
      setCount(previousCount);
      setError(caught instanceof Error ? caught.message : "Could not update like");
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
        aria-label={disabled ? `${count} likes` : liked ? "Unlike post" : "Like post"}
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
