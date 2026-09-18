"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendInspectionToDealerSpace } from "@/features/partner/send-actions";

import { useTranslator } from "@/lib/i18n/client";

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
  const uiText = useTranslator();
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
          ? uiText("ui.this_delivery_is_already_in_progress_1ff3c6a3c1")
          : uiText("ui.queued_for_delivery_to_dealerspace_e0dfa66441"),
      );
      router.refresh();
    });
  };

  if (status === "delivered") {
    return (
      <div className={`flex items-center gap-2 text-sm text-emerald-600 ${className ?? ""}`}>
        <CheckCircle2 className="h-4 w-4" />{uiText("ui.delivered_to_dealerspace_3a72c1b223")}</div>
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
        {isRetry ? uiText("ui.retry_delivery_a9e1b443d1") : inFlight ? uiText("ui.sending_b8ed5279e8") : uiText("ui.send_to_dealerspace_ca470baab0")}
      </Button>

      {!deliverablesReady && (
        <p className="mt-2 text-xs text-muted-foreground">{uiText("ui.available_once_the_inspection_report_and_vsc_83058c931e")}</p>
      )}
      {inFlight && (
        <p className="mt-2 text-xs text-muted-foreground">{uiText("ui.queued_dealerspace_will_pull_the_reports_onc_6729021bf7")}</p>
      )}
    </div>
  );
}
