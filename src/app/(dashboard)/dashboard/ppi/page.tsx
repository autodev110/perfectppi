import { getMyPpiRequests } from "@/features/ppi/queries";
import { PpiStatusBadge } from "@/components/shared/ppi-status-badge";
import { PpiBadge } from "@/components/shared/ppi-badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, ClipboardCheck, ChevronRight } from "lucide-react";
import type { PpiRequestStatus } from "@/types/enums";

const STATUS_TABS: { label: string; value: PpiRequestStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "In Progress", value: "in_progress" },
  { label: "Submitted", value: "submitted" },
  { label: "Completed", value: "completed" },
];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function MyInspectionsPage({ searchParams }: PageProps) {
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
          <h1 className="font-heading text-2xl font-bold">My Inspections</h1>
          <p className="text-muted-foreground text-sm mt-1">
            All your pre-purchase inspection requests
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/ppi/new">
            <Plus className="h-4 w-4 mr-2" />
            New Inspection
          </Link>
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
          <h3 className="text-lg font-semibold mb-2">No inspections yet</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-sm">
            Start a new pre-purchase inspection to evaluate a vehicle before you buy.
          </p>
          <Button asChild>
            <Link href="/dashboard/ppi/new">
              <Plus className="h-4 w-4 mr-2" />
              Start Your First Inspection
            </Link>
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
            const vehicleName = vehicle
              ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
                  .filter(Boolean)
                  .join(" ")
              : "Unknown Vehicle";

            return (
              <Link
                key={req.id}
                href={`/dashboard/ppi/${req.id}`}
                className="flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-card/80 hover:border-primary/30 transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold truncate">{vehicleName}</span>
                    <PpiBadge type={req.ppi_type} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <PpiStatusBadge status={req.status} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(req.created_at).toLocaleDateString("en-US", {
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
