import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Inbox } from "lucide-react";
import { requireRole } from "@/features/auth/guards";
import {
  getConnectionUserLinks,
  getIncomingPartnerInspections,
  getManagerContext,
  getOrgInstallationCodes,
  getOrgPartnerConnections,
} from "@/features/partner/queries";
import { DealerSpaceConnectionPanel } from "./connection-panel";
import { PpiStatusBadge } from "@/components/shared/ppi-status-badge";
import {
  DeliveryStatusBadge,
  IntegrationStatusBadge,
  SourceBadge,
} from "@/components/shared/source-badge";
import { formatDate } from "@/lib/utils/formatting";

export const dynamic = "force-dynamic";

// ============================================================================
// The DealerSpace integration home: connection management on top, incoming
// queue below.
//
// Everything a manager does with DealerSpace lives here, so the nav item is a
// destination rather than a signpost pointing at Settings.
//
// The queue is driven by the integration records rather than by submissions, so
// an inspection that has been received and assigned but not yet started still
// appears — those are exactly the ones a manager needs to chase.
// ============================================================================

export default async function IncomingDealerSpaceInspectionsPage() {
  await requireRole(["org_manager"]);

  const context = await getManagerContext();
  if (!context) redirect("/login");

  const [inspections, connections, codes] = await Promise.all([
    getIncomingPartnerInspections(context.organizationId),
    getOrgPartnerConnections(context.organizationId),
    getOrgInstallationCodes(context.organizationId),
  ]);
  const userLinks = await getConnectionUserLinks(connections.map((c) => c.id));

  const activeConnection = connections.find((c) => c.status === "active");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">DealerSpace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect a dealership management system and track the vehicles it sends
          for inspection.
        </p>
      </div>

      <DealerSpaceConnectionPanel
        connections={connections}
        codes={codes}
        userLinks={userLinks}
      />

      {activeConnection && (
        <div>
          <h2 className="font-heading text-lg font-bold">Incoming inspections</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Vehicles sent to your organization from the connected dealership.
          </p>
        </div>
      )}

      {activeConnection && inspections.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 font-semibold">Nothing received yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            When a DealerSpace technician clicks <strong>Send to Perfect PPI</strong>, the
            vehicle appears here.
          </p>
        </div>
      )}

      {inspections.length > 0 && (
        <div className="space-y-3">
          {inspections.map((row) => {
            const vehicleName =
              [row.vehicle.year, row.vehicle.make, row.vehicle.model, row.vehicle.trim]
                .filter(Boolean)
                .join(" ") || "Unknown Vehicle";

            return (
              <div key={row.refId} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{vehicleName}</p>
                      <SourceBadge sourceSystem="dealerspace" label={row.sourceLabel} />
                    </div>

                    <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                      {row.vehicle.vin && (
                        <span>
                          VIN <span className="font-mono">{row.vehicle.vin}</span>
                        </span>
                      )}
                      {row.vehicle.stockNumber && (
                        <span>
                          Stock <span className="font-mono">{row.vehicle.stockNumber}</span>
                        </span>
                      )}
                      {row.vehicle.mileage !== null && (
                        <span>{row.vehicle.mileage.toLocaleString()} mi</span>
                      )}
                      <span>Received {formatDate(row.receivedAt)}</span>
                      <span>
                        Technician{" "}
                        {row.assignedTech?.displayName ?? "Unassigned"}
                      </span>
                      {row.externalReconCaseId && (
                        <span>
                          Recon case{" "}
                          <span className="font-mono">{row.externalReconCaseId}</span>
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <PpiStatusBadge status={row.status as never} />
                      <IntegrationStatusBadge status={row.integrationStatus} />
                      <DeliveryStatusBadge status={row.deliveryStatus} />
                    </div>
                  </div>

                  <Link
                    href={`/org/inspections/dealerspace/${row.refId}`}
                    className="flex shrink-0 items-center gap-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
                  >
                    Open
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
