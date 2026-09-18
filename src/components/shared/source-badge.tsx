import { Building2 } from "lucide-react";
import { t as uiText } from "@/lib/i18n";

// ============================================================================
// Marks an inspection that arrived from a partner system rather than from a
// Perfect PPI consumer. Renders nothing for ordinary inspections, so it can be
// dropped into any list without an enclosing conditional.
// ============================================================================

const SOURCE_LABELS: Record<string, string> = {
  dealerspace: "DealerSpace",
};

export function SourceBadge({
  sourceSystem,
  label,
  className = "",
}: {
  sourceSystem: string | null | undefined;
  label?: string | null;
  className?: string;
}) {
  if (!sourceSystem || sourceSystem === "perfectppi") return null;

  const text = label ?? SOURCE_LABELS[sourceSystem] ?? sourceSystem;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300 ${className}`}
    >
      <Building2 className="h-3 w-3" />
      {text}
    </span>
  );
}

const DELIVERY_STYLES: Record<string, string> = {
  not_requested: "bg-secondary text-secondary-foreground",
  queued: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  delivering: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  delivered: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/10 text-destructive",
};

const DELIVERY_LABELS: Record<string, string> = {
  not_requested: uiText("ui.not_sent_cd5f943d58"),
  queued: uiText("ui.queued_661ff40a07"),
  delivering: uiText("ui.sending_e595f17fac"),
  delivered: uiText("ui.delivered_9061156573"),
  failed: uiText("ui.delivery_failed_b486522010"),
};

export function DeliveryStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        DELIVERY_STYLES[status] ?? DELIVERY_STYLES.not_requested
      }`}
    >
      {DELIVERY_LABELS[status] ?? status}
    </span>
  );
}

const INTEGRATION_LABELS: Record<string, string> = {
  created: uiText("ui.received_49f19beeec"),
  assigned: uiText("ui.assigned_8191888dd9"),
  accepted: uiText("ui.accepted_a00fb0c507"),
  in_progress: uiText("ui.in_progress_c1f88e9d6c"),
  submitted: uiText("ui.submitted_64900440a8"),
  outputs_generating: uiText("ui.generating_reports_53c7122b54"),
  deliverables_ready: uiText("ui.reports_ready_d57c328bb7"),
  outputs_failed: uiText("ui.report_generation_failed_f15718060c"),
  needs_revision: uiText("ui.needs_revision_575452f730"),
  cancelled: uiText("ui.cancelled_d353a99eb4"),
};

const INTEGRATION_STYLES: Record<string, string> = {
  outputs_failed: "bg-destructive/10 text-destructive",
  deliverables_ready: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  outputs_generating: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

export function IntegrationStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        INTEGRATION_STYLES[status] ?? "bg-secondary text-secondary-foreground"
      }`}
    >
      {INTEGRATION_LABELS[status] ?? status}
    </span>
  );
}
