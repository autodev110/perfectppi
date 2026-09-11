"use client";

import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Share (plan 15.4): the native share sheet where the browser has one,
// otherwise copy the link. The link is the canonical page, so whoever opens
// it is re-checked against the current visibility rules.
export function ShareButton({
  path,
  title,
  compact = false,
  className,
}: {
  /** Site-relative canonical path, e.g. /community/posts/<id>. */
  path: string;
  title?: string;
  compact?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ url, title });
        return;
      }
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch (reason) {
      // A dismissed share sheet is not a failure.
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setState("failed");
    } finally {
      window.setTimeout(() => setState("idle"), 2000);
    }
  }

  const Icon = state === "copied" ? Check : state === "failed" ? Link2 : Share2;
  return (
    <button
      type="button"
      onClick={share}
      className={cn(
        "inline-flex items-center gap-2 rounded-full text-sm font-bold text-on-surface-variant transition-colors hover:text-primary",
        compact ? "px-1" : "",
        className,
      )}
      aria-label="Share"
    >
      <Icon className="h-4 w-4" />
      {compact ? null : state === "copied" ? "Link copied" : state === "failed" ? "Copy failed" : "Share"}
    </button>
  );
}
