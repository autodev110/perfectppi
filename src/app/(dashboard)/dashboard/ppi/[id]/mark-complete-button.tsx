"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface MarkCompleteButtonProps {
  requestId: string;
}

export function MarkCompleteButton({ requestId }: MarkCompleteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/ppi/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Failed to mark inspection as completed");
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} disabled={isPending}>
        {isPending ? "Marking Complete…" : "Mark as Completed"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
