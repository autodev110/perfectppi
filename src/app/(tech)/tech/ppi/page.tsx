import { getTechQueue } from "@/features/ppi/queries";
import { PpiStatusBadge } from "@/components/shared/ppi-status-badge";
import Link from "next/link";
import { ChevronRight, ClipboardCheck } from "lucide-react";
import type { PpiRequestStatus } from "@/types/enums";

const QUEUE_TABS: { label: string; value: PpiRequestStatus | "active" }[] = [
  { label: "Active", value: "active" },
  { label: "Assigned", value: "assigned" },
  { label: "Accepted", value: "accepted" },
  { label: "In Progress", value: "in_progress" },
  { label: "Submitted", value: "submitted" },
];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function InspectionQueuePage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const activeStatus = status as PpiRequestStatus | undefined;

  const requests = await getTechQueue(activeStatus ? { status: activeStatus } : undefined);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Inspection Queue</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your assigned inspection requests
        </p>
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
          <h3 className="text-lg font-semibold mb-2">Queue is empty</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            No inspections in this queue. Check back later or update your profile to receive assignments.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const vehicle = req.vehicle as {
              year: number | null;
              make: string | null;
              model: string | null;
            } | null;
            const vehicleName = vehicle
              ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
              : "Unknown Vehicle";

            const requester = req.requester as { display_name: string | null } | null;

            const canAction = ["assigned", "accepted"].includes(req.status);
            const actionLabel =
              req.status === "assigned"
                ? "Accept & Start"
                : req.status === "accepted"
                ? "Begin Inspection"
                : "View";

            return (
              <div
                key={req.id}
                className="flex items-center gap-4 p-4 rounded-xl border bg-card"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{vehicleName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    From {requester?.display_name ?? "Consumer"} ·{" "}
                    {new Date(req.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <div className="mt-2">
                    <PpiStatusBadge status={req.status} />
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
