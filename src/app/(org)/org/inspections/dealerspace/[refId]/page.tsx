import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, FileJson, FileText } from "lucide-react";
import { requireRole } from "@/features/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerContext, getReadySubmissionVersions } from "@/features/partner/queries";
import {
  DeliveryStatusBadge,
  IntegrationStatusBadge,
  SourceBadge,
} from "@/components/shared/source-badge";
import { PpiStatusBadge } from "@/components/shared/ppi-status-badge";
import { SendToDealerSpaceButton } from "@/components/shared/send-to-dealerspace-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/utils/formatting";
import { REQUIRED_ARTIFACT_TYPES } from "@/features/partner/constants";
import type { PpiRequestStatus } from "@/types/enums";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ refId: string }>;
}

const ARTIFACT_LABELS: Record<string, string> = {
  inspection_report_json: uiText("ui.inspection_report_json_dbe06172c7"),
  inspection_report_pdf: uiText("ui.inspection_report_pdf_69a2a7a510"),
  vsc_determination_json: uiText("ui.vsc_determination_json_a2195696e5"),
  vsc_determination_pdf: uiText("ui.vsc_determination_pdf_72497aae88"),
};

export default async function DealerSpaceInspectionDetailPage({ params }: PageProps) {
  const uiText = await getRequestTranslator();
  await requireRole(["org_manager"]);

  const context = await getManagerContext();
  if (!context) redirect("/login");

  const { refId } = await params;
  const admin = createAdminClient();

  const { data: ref } = await admin
    .from("external_inspection_refs")
    .select(
      `
      *,
      request:ppi_requests!external_inspection_refs_ppi_request_id_fkey(
        id, status, requesting_organization_id,
        assigned_tech:profiles!ppi_requests_assigned_tech_id_fkey(id, display_name, username)
      )
    `,
    )
    .eq("id", refId)
    .maybeSingle();

  const request = ref?.request as {
    id: string;
    status: string;
    requesting_organization_id: string | null;
    assigned_tech: { id: string; display_name: string | null } | null;
  } | null;

  // Tenancy is proven against the request's own organization, not against the
  // id in the URL.
  if (!ref || !request || request.requesting_organization_id !== context.organizationId) {
    notFound();
  }

  const [{ data: artifacts }, { data: events }] = await Promise.all([
    admin
      .from("integration_artifacts")
      .select("id, artifact_type, output_version, size_bytes, sha256, generated_at")
      .eq("external_inspection_ref_id", ref.id)
      .order("output_version", { ascending: false }),
    admin
      .from("outbound_events")
      .select("id, event_type, status, attempt_count, last_response_status, last_error, created_at, delivered_at")
      .eq("external_inspection_ref_id", ref.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const ready = ref.current_submission_id
    ? await getReadySubmissionVersions([ref.current_submission_id])
    : new Map<string, number>();
  const readyVersion = ref.current_submission_id
    ? ready.get(ref.current_submission_id)
    : undefined;

  const snapshot = (ref.vehicle_snapshot ?? {}) as Record<string, unknown>;
  const vehicleName =
    [snapshot.year, snapshot.make, snapshot.model, snapshot.trim]
      .filter(Boolean)
      .join(" ") || uiText("ui.unknown_vehicle_615ff95383");

  const presentTypes = new Set(
    (artifacts ?? [])
      .filter((a) => a.output_version === readyVersion)
      .map((a) => a.artifact_type),
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/org/inspections/dealerspace"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />{uiText("ui.incoming_dealerspace_inspections_018188f6e3")}</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-bold">{vehicleName}</h1>
            <SourceBadge sourceSystem="dealerspace" label={ref.source_label} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PpiStatusBadge status={request.status as PpiRequestStatus} />
            <IntegrationStatusBadge status={ref.integration_status} />
            <DeliveryStatusBadge status={ref.delivery_status} />
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {/* This page reports on the inspection; the work itself happens in the
              technician workflow. Without this link a manager can see every
              detail here and have no way to open it. */}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/tech/ppi/${request.id}`}>{uiText("ui.open_inspection_8e231e5f94")}<ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>

          <SendToDealerSpaceButton
            requestId={request.id}
            deliveryStatus={ref.delivery_status}
            deliverablesReady={readyVersion !== undefined}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{uiText("ui.vehicle_snapshot_764ce90825")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-xs text-muted-foreground">{uiText("ui.captured_when_dealerspace_sent_this_vehicle__7de6ea0c8e")}</p>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {[
              [uiText("ui.vin_5e0211b12d"), snapshot.vin],
              [uiText("ui.stock_number_74608bd0de"), snapshot.stockNumber],
              [uiText("ui.mileage_ffe44a0179"), snapshot.mileage],
              [uiText("ui.exterior_colour_5b9d83c335"), snapshot.exteriorColor],
              [uiText("ui.interior_colour_f9484cc186"), snapshot.interiorColor],
              [uiText("ui.engine_8e75ebbdb2"), snapshot.engine],
              [uiText("ui.transmission_3e10134259"), snapshot.transmission],
              [uiText("ui.drivetrain_203e886158"), snapshot.drivetrain],
            ]
              .filter(([, value]) => value !== null && value !== undefined && value !== "")
              .map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="text-muted-foreground">{String(label)}</dt>
                  <dd className="mt-0.5 font-medium">{String(value)}</dd>
                </div>
              ))}
          </dl>

          <Separator className="my-4" />

          <dl className="grid gap-x-8 gap-y-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{uiText("ui.assigned_technician_2f63a211ae")}</dt>
              <dd className="mt-0.5 font-medium">
                {request.assigned_tech?.display_name ?? uiText("ui.unassigned_14d33bd014")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{uiText("ui.received_49f19beeec")}</dt>
              <dd className="mt-0.5 font-medium">{formatDateTime(ref.created_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{uiText("ui.dealerspace_recon_case_3434e76d42")}</dt>
              <dd className="mt-0.5 font-mono">{ref.external_recon_case_id ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{uiText("ui.dealerspace_inspection_phase_8451b47b0b")}</dt>
              <dd className="mt-0.5 font-mono">
                {ref.external_inspection_phase_id ?? "—"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{uiText("ui.deliverables_c7ec4b92c2")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">{uiText("ui.all_four_artifacts_must_exist_for_one_output_63e283c480")}</p>

          {REQUIRED_ARTIFACT_TYPES.map((type) => {
            const artifact = (artifacts ?? []).find(
              (a) => a.artifact_type === type && a.output_version === readyVersion,
            );
            const present = presentTypes.has(type);

            return (
              <div
                key={type}
                className="flex items-center justify-between rounded-lg border p-3 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {type.endsWith("_pdf") ? (
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileJson className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">{ARTIFACT_LABELS[type]}</p>
                    {artifact && (
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {Number(artifact.size_bytes).toLocaleString()}{uiText("ui.bytes_sha256_f3f7b9f45e")}{" "}
                        {artifact.sha256.slice(0, 16)}…
                      </p>
                    )}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    present
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {present ? uiText("ui.ready_5fa7aac537") : uiText("ui.pending_331551b0de")}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {(events ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{uiText("ui.delivery_activity_9f88a4c8ca")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(events ?? []).map((event) => {
              const error = event.last_error as { message?: string } | null;
              return (
                <div
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-mono font-medium">{event.event_type}</p>
                    <p className="text-muted-foreground">
                      {formatDateTime(event.created_at)}
                      {event.attempt_count > 0 && uiText("ui.attempt_s_77f0b2057e", { arg0: String(event.attempt_count) })}
                      {event.last_response_status && uiText("ui.http_08753830b5", { arg0: String(event.last_response_status) })}
                    </p>
                    {error?.message && (
                      <p className="mt-0.5 text-destructive">{error.message}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">
                    {event.status}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
