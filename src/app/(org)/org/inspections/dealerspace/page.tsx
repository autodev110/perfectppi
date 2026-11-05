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
import { BrowserPartnerPanel } from "./browser-partner-panel";
import { PARTNER_SYSTEMS } from "@/features/partner/systems";
import { PpiStatusBadge } from "@/components/shared/ppi-status-badge";
import {
  DeliveryStatusBadge,
  IntegrationStatusBadge,
  SourceBadge,
} from "@/components/shared/source-badge";
import { formatDate } from "@/lib/utils/formatting";

import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

// ============================================================================
// The partner integrations home: connection management on top, incoming
// queue below.
//
// Everything a manager does with a partner lives here, so the nav item is a
// destination rather than a signpost pointing at Settings.
//
// The queue is driven by the integration records rather than by submissions, so
// an inspection that has been received and assigned but not yet started still
// appears — those are exactly the ones a manager needs to chase.
// ============================================================================

export default async function PartnerIntegrationsPage() {
  const uiText = await getRequestTranslator();
  await requireRole(["org_manager"]);

  const context = await getManagerContext();
  if (!context) redirect("/login");

  const [inspections, connections, codes] = await Promise.all([
    getIncomingPartnerInspections(context.organizationId),
    getOrgPartnerConnections(context.organizationId),
    getOrgInstallationCodes(context.organizationId),
  ]);
  const userLinks = await getConnectionUserLinks(connections.map((c) => c.id));

  const anyActive = connections.some((c) => c.status === "active");
  const dealerSpaceConnections = connections.filter((c) => c.sourceSystem === "dealerspace");
  const dealerSpaceIds = new Set(dealerSpaceConnections.map((c) => c.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.partner_integrations_cd6b83e038")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{uiText("ui.connect_the_systems_your_shops_work_in_and_t_06bce57acc")}</p>
      </div>

      <DealerSpaceConnectionPanel
        connections={dealerSpaceConnections}
        codes={codes}
        userLinks={userLinks.filter((link) => dealerSpaceIds.has(link.connectionId))}
      />

      {Object.values(PARTNER_SYSTEMS)
        .filter((system) => system.browserConnect)
        .map((system) => {
          const connection = connections.find(
            (c) => c.sourceSystem === system.id && c.status === "active",
          );
          return (
            <BrowserPartnerPanel
              key={system.id}
              partnerName={system.label}
              connection={connection ?? null}
              userLinks={
                connection
                  ? userLinks.filter((link) => link.connectionId === connection.id)
                  : []
              }
            />
          );
        })}

      {anyActive && (
        <div>
          <h2 className="font-heading text-lg font-bold">{uiText("ui.incoming_inspections_4614232169")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{uiText("ui.vehicles_sent_to_your_organization_from_your_b7d0786342")}</p>
        </div>
      )}

      {anyActive && inspections.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 font-semibold">{uiText("ui.nothing_received_yet_28053acc50")}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{uiText("ui.when_staff_at_a_connected_partner_send_a_veh_3f6fd7e647")}</p>
        </div>
      )}

      {inspections.length > 0 && (
        <div className="space-y-3">
          {inspections.map((row) => {
            const vehicleName =
              [row.vehicle.year, row.vehicle.make, row.vehicle.model, row.vehicle.trim]
                .filter(Boolean)
                .join(" ") || uiText("ui.unknown_vehicle_615ff95383");

            return (
              <div key={row.refId} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{vehicleName}</p>
                      <SourceBadge sourceSystem={row.sourceSystem} label={row.sourceLabel} />
                    </div>

                    <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                      {row.vehicle.vin && (
                        <span>{uiText("ui.vin_439a32c322")}<span className="font-mono">{row.vehicle.vin}</span>
                        </span>
                      )}
                      {row.vehicle.stockNumber && (
                        <span>{uiText("ui.stock_238e0f57c9")}<span className="font-mono">{row.vehicle.stockNumber}</span>
                        </span>
                      )}
                      {row.vehicle.mileage !== null && (
                        <span>{row.vehicle.mileage.toLocaleString()}{uiText("ui.mi_3074dbe604")}</span>
                      )}
                      <span>{uiText("ui.received_6977283ffa")}{formatDate(row.receivedAt)}</span>
                      <span>{uiText("ui.technician_9041ccc417")}{" "}
                        {row.assignedTech?.displayName ?? uiText("ui.unassigned_14d33bd014")}
                      </span>
                      {row.externalReconCaseId && (
                        <span>{uiText("ui.recon_case_c56ccf8ba9")}{" "}
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
                  >{uiText("ui.open_ed077f3d81")}<ChevronRight className="h-4 w-4" />
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
