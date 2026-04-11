"use client";

import { useState, useTransition } from "react";
import { createShareLink } from "@/features/media/actions";
import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  targetType: "media_package" | "inspection_result" | "standardized_output";
  targetId: string;
}

export function ShareButton({ targetType, targetId }: ShareButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleCreateShareLink() {
    setMessage(null);

    startTransition(async () => {
      const result = await createShareLink({
        targetType,
        targetId,
      });

      if ("error" in result) {
        setMessage(result.error ?? "Failed to create share link");
        return;
      }

      const url = result.data.url;
      try {
        await navigator.clipboard.writeText(url);
        setMessage("Share link copied to clipboard.");
      } catch {
        setMessage(url);
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCreateShareLink}
        disabled={isPending}
      >
        {isPending ? "Generating..." : "Share"}
      </Button>
      {message ? <p className="text-xs text-on-surface-variant break-all">{message}</p> : null}
    </div>
  );
}
