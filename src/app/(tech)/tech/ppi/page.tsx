import { getTechQueue } from "@/features/ppi/queries";
import { PpiStatusBadge } from "@/components/shared/ppi-status-badge";
import Link from "next/link";
import { ChevronRight, ClipboardCheck } from "lucide-react";
import { SourceBadge } from "@/components/shared/source-badge";
import type { InspectionScope, PpiRequestStatus } from "@/types/enums";
import { inspectionDisplayName } from "@/features/ppi/presentation";
import { INSPECTION_SCOPE_LABELS } from "@/features/ppi/constants";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

const QUEUE_TABS: { label: string; value: PpiRequestStatus | "active" }[] = [
  { label: uiText("ui.active_9234069589"), value: "active" },
  { label: uiText("ui.assigned_8191888dd9"), value: "assigned" },
  { label: uiText("ui.accepted_a00fb0c507"), value: "accepted" },
  { label: uiText("ui.in_progress_b4cc4b07c3"), value: "in_progress" },
  { label: uiText("ui.submitted_64900440a8"), value: "submitted" },
];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function InspectionQueuePage({ searchParams }: PageProps) {
  const uiText = await getRequestTranslator();
  const { status } = await searchParams;
  const activeStatus = status as PpiRequestStatus | undefined;

  const requests = await getTechQueue(activeStatus ? { status: activeStatus } : undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.inspection_queue_fcf0951787")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{uiText("ui.your_assigned_inspection_requests_d68863e3f9")}</p>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {QUEUE_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === "active" ? "/tech/ppi" : `/tech/ppi?status=${tab.value}`}
            className={[
              "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
              (tab.value === "active" && !activeStatus) || tab.value === activeStatus
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-6 rounded-full bg-primary/10 p-6">
            <ClipboardCheck className="h-12 w-12 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">{uiText("ui.queue_is_empty_c501c69515")}</h3>
          <p className="text-muted-foreground text-sm max-w-sm">{uiText("ui.no_inspections_in_this_queue_check_back_late_5417dde427")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const vehicle = req.vehicle as {
              year: number | null;
              make: string | null;
              model: string | null;
            } | null;
            const inspectionName = inspectionDisplayName(vehicle, req.ppi_type, req.created_at);

            const requester = req.requester as { display_name: string | null } | null;
            // Organization-requested inspections have no consumer requester.
            const sourceLabel =
              req.source_system === "dealerspace" ? "DealerSpace" : uiText("ui.consumer_3fdb185870");

            const canAction = ["assigned", "accepted"].includes(req.status);
            const actionLabel =
              req.status === "assigned"
                ? uiText("ui.accept_start_ba8f8dd28a")
                : req.status === "accepted"
                ? uiText("ui.begin_inspection_48623433af")
                : uiText("ui.view_dcc839a401");

            return (
              <div
                key={req.id}
                className="flex items-center gap-4 p-4 rounded-xl border bg-card"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{inspectionName}</p>
                    <SourceBadge sourceSystem={req.source_system} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{uiText("ui.from_e484a95dcc")}{requester?.display_name ?? sourceLabel} ·{" "}
                    {new Date(req.created_at).toLocaleDateString(uiText("ui.en_us_5c49f88daf"), {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <PpiStatusBadge status={req.status} />
                    <span className="rounded-full bg-secondary px-2 py-1 text-xs font-medium">
                      {INSPECTION_SCOPE_LABELS[
                        (req.inspection_scope ?? uiText("ui.complete_eebbf6457e")) as InspectionScope
                      ]}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/tech/ppi/${req.id}`}
                  className={[
                    "flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0",
                    canAction
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-border text-foreground hover:bg-secondary",
                  ].join(" ")}
                >
                  {actionLabel}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
