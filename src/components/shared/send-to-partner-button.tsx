"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Send, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendInspectionToPartner } from "@/features/partner/send-actions";

import { useTranslator } from "@/lib/i18n/client";

interface SendToPartnerButtonProps {
  requestId: string;
  partnerLabel: string;
  /** No button unless a delivery has failed: the reports go out on their own. */
  autoDelivery?: boolean;
  deliveryStatus: string;
  /** False while any of the four required artifacts is still missing. */
  deliverablesReady: boolean;
  className?: string;
}

// ============================================================================
// The button enqueues a delivery and returns immediately. It is disabled — and
// says why — until all four artifacts exist, so a partial set can never be
// pushed to a partner. An automatic partner only ever sees the retry.
// ============================================================================

export function SendToPartnerButton({
  requestId,
  partnerLabel,
  autoDelivery = false,
  deliveryStatus,
  deliverablesReady,
  className,
}: SendToPartnerButtonProps) {
  const uiText = useTranslator();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(deliveryStatus);

  const send = () => {
    startTransition(async () => {
      const result = await sendInspectionToPartner(requestId);

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      setStatus("queued");
      toast.success(
        result.data.alreadyQueued
          ? uiText("ui.this_delivery_is_already_in_progress_1ff3c6a3c1")
          : uiText("ui.queued_for_delivery_to_75252103bf", { arg0: String(partnerLabel) }),
      );
      router.refresh();
    });
  };

  if (status === "delivered") {
    return (
      <div className={`flex items-center gap-2 text-sm text-emerald-600 ${className ?? ""}`}>
        <CheckCircle2 className="h-4 w-4" />{uiText("ui.delivered_to_4b8bc6932e", { arg0: String(partnerLabel) })}</div>
    );
  }

  const isRetry = status === "failed";
  const inFlight = status === "queued" || status === "delivering";

  if (autoDelivery && !isRetry) {
    return (
      <p className={`text-xs text-muted-foreground ${className ?? ""}`}>
        {inFlight
          ? uiText("ui.sending_to_it_will_pull_the_reports_once_it__87ca83bbd9", { arg0: String(partnerLabel) })
          : uiText("ui.reports_are_sent_to_automatically_once_they__f3103c4d82", { arg0: String(partnerLabel) })}
      </p>
    );
  }

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
        {isRetry ? uiText("ui.retry_delivery_a9e1b443d1") : inFlight ? uiText("ui.sending_b8ed5279e8") : uiText("ui.send_to_3b53731958", { arg0: String(partnerLabel) })}
      </Button>

      {!deliverablesReady && (
        <p className="mt-2 text-xs text-muted-foreground">{uiText("ui.available_once_the_inspection_report_and_vsc_83058c931e")}</p>
      )}
      {inFlight && (
        <p className="mt-2 text-xs text-muted-foreground">{uiText("ui.queued_will_pull_the_reports_once_it_receive_443b867941", { arg0: String(partnerLabel) })}</p>
      )}
    </div>
  );
}
