import { Building2 } from "lucide-react";

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
  not_requested: "Not sent",
  queued: "Queued",
  delivering: "Sending",
  delivered: "Delivered",
  failed: "Delivery failed",
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
  created: "Received",
  assigned: "Assigned",
  accepted: "Accepted",
  in_progress: "In progress",
  submitted: "Submitted",
  outputs_generating: "Generating reports",
  deliverables_ready: "Reports ready",
  outputs_failed: "Report generation failed",
  needs_revision: "Needs revision",
  cancelled: "Cancelled",
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
