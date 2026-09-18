"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

import { useTranslator } from "@/lib/i18n/client";

interface MarkCompleteButtonProps {
  requestId: string;
}

export function MarkCompleteButton({ requestId }: MarkCompleteButtonProps) {
  const uiText = useTranslator();
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
        setError(payload?.error ?? uiText("ui.failed_to_mark_inspection_as_completed_596f47099a"));
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} disabled={isPending}>
        {isPending ? uiText("ui.marking_complete_386d1f7e0c") : uiText("ui.mark_as_completed_bb33aaa11f")}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
