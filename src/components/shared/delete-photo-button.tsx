"use client";

import { useTransition } from "react";
import { X } from "lucide-react";

/**
 * Small "x" affordance in the corner of an uploaded photo. Deleting media is
 * not undoable, so it confirms first — the click target itself stays tiny so it
 * doesn't fight the photo for attention.
 */
export function DeletePhotoButton({
  onDelete,
  label = "Delete photo",
  confirmMessage = "Delete this photo? This cannot be undone.",
}: {
  onDelete: () => Promise<void> | Promise<unknown>;
  label?: string;
  confirmMessage?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={isPending}
      onClick={() => {
        if (isPending) return;
        if (!window.confirm(confirmMessage)) return;
        startTransition(async () => {
          await onDelete();
        });
      }}
      className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white shadow-sm backdrop-blur-sm transition-all hover:bg-destructive hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
