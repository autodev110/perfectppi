import { getMyPpiRequests } from "@/features/ppi/queries";
import { PpiStatusBadge } from "@/components/shared/ppi-status-badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, ClipboardCheck, ChevronRight } from "lucide-react";
import type { InspectionScope, PpiRequestStatus } from "@/types/enums";
import { inspectionDisplayName } from "@/features/ppi/presentation";
import { INSPECTION_SCOPE_LABELS } from "@/features/ppi/constants";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

const STATUS_TABS: { label: string; value: PpiRequestStatus | "all" }[] = [
  { label: uiText("ui.all_a52ace420f"), value: "all" },
  { label: uiText("ui.draft_ebf12ef47c"), value: "draft" },
  { label: uiText("ui.in_progress_b4cc4b07c3"), value: "in_progress" },
  { label: uiText("ui.submitted_64900440a8"), value: "submitted" },
  { label: uiText("ui.completed_22a970d2e5"), value: "completed" },
];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function MyInspectionsPage({ searchParams }: PageProps) {
  const uiText = await getRequestTranslator();
  const { status } = await searchParams;
  const activeStatus = (status as PpiRequestStatus) || undefined;

  const requests = await getMyPpiRequests(
    activeStatus ? { status: activeStatus } : undefined
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{uiText("ui.my_inspections_944292ab1e")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{uiText("ui.all_your_pre_purchase_inspection_requests_31190f1f15")}</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/ppi/new">
            <Plus className="h-4 w-4 mr-2" />{uiText("ui.new_inspection_2841d576b4")}</Link>
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === "all" ? "/dashboard/ppi" : `/dashboard/ppi?status=${tab.value}`}
            className={[
              "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
              (tab.value === "all" && !activeStatus) ||
              tab.value === activeStatus
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Inspection list */}
      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-6 rounded-full bg-primary/10 p-6">
            <ClipboardCheck className="h-12 w-12 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">{uiText("ui.no_inspections_yet_fd46a43da4")}</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-sm">{uiText("ui.start_a_new_pre_purchase_inspection_to_evalu_0c3fd79a9f")}</p>
          <Button asChild>
            <Link href="/dashboard/ppi/new">
              <Plus className="h-4 w-4 mr-2" />{uiText("ui.start_your_first_inspection_939d785920")}</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const vehicle = req.vehicle as {
              year: number | null;
              make: string | null;
              model: string | null;
              trim: string | null;
            } | null;
            const inspectionName = inspectionDisplayName(vehicle, req.ppi_type, req.created_at);

            return (
              <Link
                key={req.id}
                href={`/dashboard/ppi/${req.id}`}
                className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-card/80 hover:border-primary/30 transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold truncate">{inspectionName}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <PpiStatusBadge status={req.status} />
                    <span className="rounded-full bg-secondary px-2 py-1 text-xs font-medium">
                      {INSPECTION_SCOPE_LABELS[
                        (req.inspection_scope ?? uiText("ui.complete_eebbf6457e")) as InspectionScope
                      ]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(req.created_at).toLocaleDateString(uiText("ui.en_us_5c49f88daf"), {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
