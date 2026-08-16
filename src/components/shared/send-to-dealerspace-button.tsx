"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendInspectionToDealerSpace } from "@/features/partner/send-actions";

interface SendToDealerSpaceButtonProps {
  requestId: string;
  deliveryStatus: string;
  /** False while any of the four required artifacts is still missing. */
  deliverablesReady: boolean;
  className?: string;
}

// ============================================================================
// The button enqueues a delivery and returns immediately. It is disabled — and
// says why — until all four artifacts exist, so a partial set can never be
// pushed to a dealership's Recon phase.
// ============================================================================

export function SendToDealerSpaceButton({
  requestId,
  deliveryStatus,
  deliverablesReady,
  className,
}: SendToDealerSpaceButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(deliveryStatus);

  const send = () => {
    startTransition(async () => {
      const result = await sendInspectionToDealerSpace(requestId);

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      setStatus("queued");
      toast.success(
        result.data.alreadyQueued
          ? "This delivery is already in progress."
          : "Queued for delivery to DealerSpace.",
      );
      router.refresh();
    });
  };

  if (status === "delivered") {
    return (
      <div className={`flex items-center gap-2 text-sm text-emerald-600 ${className ?? ""}`}>
        <CheckCircle2 className="h-4 w-4" />
        Delivered to DealerSpace
      </div>
    );
  }

  const isRetry = status === "failed";
  const inFlight = status === "queued" || status === "delivering";

  return (
    <div className={className}>
      <Button
        onClick={send}
        disabled={pending || !deliverablesReady || inFlight}
        variant={isRetry ? "outline" : "default"}
      >
        {pending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : isRetry ? (
          <RefreshCw className="mr-2 h-4 w-4" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        {isRetry ? "Retry delivery" : inFlight ? "Sending…" : "Send to DealerSpace"}
      </Button>

      {!deliverablesReady && (
        <p className="mt-2 text-xs text-muted-foreground">
          Available once the inspection report and VSC determination have both been
          generated.
        </p>
      )}
      {inFlight && (
        <p className="mt-2 text-xs text-muted-foreground">
          Queued. DealerSpace will pull the reports once it receives the notification.
        </p>
      )}
    </div>
  );
}
