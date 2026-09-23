import { getPpiRequest, getCurrentSubmission, getPpiSubmissionVersions } from "@/features/ppi/queries";
import { getOutputPair } from "@/features/outputs/queries";
import { getWarrantyOptionByVscOutput } from "@/features/warranty/queries";
import { getMyReviewForRequest } from "@/features/reviews/queries";
import { PpiStatusBadge } from "@/components/shared/ppi-status-badge";
import { PpiBadge } from "@/components/shared/ppi-badge";
import { StandardizedOutputView } from "@/components/shared/standardized-output-view";
import { VscCoverageView } from "@/components/shared/vsc-coverage-view";
import { OutputGenerationStatus } from "@/components/shared/output-generation-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Car, Calendar, User, ChevronRight, FileText, Shield } from "lucide-react";
import { INSPECTION_SCOPE_LABELS, SECTION_LABELS } from "@/features/ppi/constants";
import { GetCoverageButton } from "./get-coverage-button";
import { MarkCompleteButton } from "./mark-complete-button";
import type { InspectionScope, SectionType } from "@/types/enums";
import type { StandardizedContent, VscCoverageData } from "@/types/api";
import { inspectionDisplayName } from "@/features/ppi/presentation";
import { InspectionDeleteButton } from "@/components/shared/inspection-delete-button";
import { getCurrentSocialProfileId } from "@/features/social/relationships";
import { recordProductEvent } from "@/features/analytics/product-events";

import { getRequestTranslator } from "@/lib/i18n/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InspectionDetailPage({ params }: PageProps) {
  const uiText = await getRequestTranslator();
  const { id } = await params;
  const [request, submission, versions, existingReview, viewerId] = await Promise.all([
    getPpiRequest(id),
    getCurrentSubmission(id),
    getPpiSubmissionVersions(id),
    getMyReviewForRequest(id),
    getCurrentSocialProfileId(),
  ]);

  // Fetch outputs if there's a current submission
  const submissionId = submission?.id ?? null;
  const outputs = submissionId ? await getOutputPair(submissionId) : null;

  // Check for existing warranty option on this VSC output
  const vscOutputId = outputs?.vsc?.id ?? null;
  const existingWarrantyOption = vscOutputId
    ? await getWarrantyOptionByVscOutput(vscOutputId)
    : null;

  if (!request) notFound();

  if (viewerId && outputs?.standardized && ["submitted", "completed"].includes(request.status)) {
    await recordProductEvent({
      profileId: viewerId,
      eventName: "report_viewed",
      surface: "inspection",
      dedupeId: request.id,
    });
  }

  const vehicle = request.vehicle as {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    mileage: number | null;
  } | null;

  const inspectionName = inspectionDisplayName(vehicle, request.ppi_type, request.created_at);

  const canContinue = ["draft", "in_progress"].includes(request.status);
  const canEdit =
    request.performer_type === "self" &&
    ["submitted", "completed"].includes(request.status);
  const isSubmitted = ["submitted", "completed"].includes(request.status);
  const canMarkCompleted = request.status === "submitted";
  const canReviewTechnician =
    request.status === "completed" &&
    request.performer_type === "technician" &&
    !!request.assigned_tech;

  const sections = (submission as { sections?: { section_type: string; notes: string | null; answers: { prompt: string; answer_value: string | null; answer_type: string }[] }[] } | null)?.sections ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h1 className="font-heading text-2xl font-bold">{inspectionName}</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PpiStatusBadge status={request.status} />
            {versions.length > 1 && (
              <span className="text-xs text-muted-foreground">{uiText("ui.v_4c94485e0c")}{versions[0]?.version ?? 1}{uiText("ui.latest_6a47e389bb")}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {canMarkCompleted && <MarkCompleteButton requestId={id} />}
          {canReviewTechnician && (
            <Button variant="outline" asChild>
              <Link href={`/dashboard/ppi/${id}/review`}>
                {existingReview ? uiText("ui.edit_technician_review_9ac9a1ea4c") : uiText("ui.leave_technician_review_b0af9b2bf8")}
              </Link>
            </Button>
          )}
          {canContinue && submission && (
            <Button asChild>
              <Link href={`/dashboard/ppi/${id}/inspect?sub=${submission.id}`}>{uiText("ui.continue_inspection_05f0b20679")}</Link>
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" asChild>
              <Link href={`/dashboard/ppi/${id}/edit`}>{uiText("ui.edit_resubmit_250add2f69")}</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Vehicle details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />{uiText("ui.vehicle_details_26dd95425e")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          {vehicle?.vin && (
            <div>
              <p className="text-muted-foreground">{uiText("ui.vin_5e0211b12d")}</p>
              <p className="font-mono font-medium">{vehicle.vin}</p>
            </div>
          )}
          {vehicle?.mileage && (
            <div>
              <p className="text-muted-foreground">{uiText("ui.mileage_ffe44a0179")}</p>
              <p className="font-medium">{vehicle.mileage.toLocaleString()}{uiText("ui.mi_3074dbe604")}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">{uiText("ui.whose_car_75614f1bb0")}</p>
            <p className="font-medium capitalize">{request.whose_car}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{uiText("ui.your_role_ab3364cde0")}</p>
            <p className="font-medium capitalize">{request.requester_role}</p>
          </div>
        </CardContent>
      </Card>

      {/* Inspection meta */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />{uiText("ui.inspection_info_22d8ed0de8")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">{uiText("ui.type_baaddf70fb")}</p>
            <PpiBadge type={request.ppi_type} className="mt-1" />
          </div>
          <div>
            <p className="text-muted-foreground">{uiText("ui.inspection_6e4fa13da4")}</p>
            <p className="font-medium">
              {INSPECTION_SCOPE_LABELS[
                (request.inspection_scope ?? uiText("ui.complete_eebbf6457e")) as InspectionScope
              ]}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />{uiText("ui.created_8f4ef859fb")}</p>
            <p className="font-medium">
              {new Date(request.created_at).toLocaleDateString(uiText("ui.en_us_5c49f88daf"), {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          {request.assigned_tech && (
            <div>
              <p className="text-muted-foreground flex items-center gap-1">
                <User className="h-3.5 w-3.5" />{uiText("ui.assigned_tech_2c05b5026a")}</p>
              <p className="font-medium">
                {(request.assigned_tech as { display_name: string | null }).display_name ?? uiText("ui.technician_9041ccc417")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI-Generated Outputs (if submitted) */}
      {isSubmitted && submissionId && (
        <>
          {outputs?.standardized ? (
            <div className="space-y-3">
              <h2 className="font-heading text-lg font-bold">{uiText("ui.inspection_report_76b0f91569")}</h2>
              <StandardizedOutputView
                content={outputs.standardized.structured_content as unknown as StandardizedContent}
                generatedAt={outputs.standardized.generated_at}
                documentUrl={`/api/outputs/${outputs.standardized.id}/pdf`}
                outputId={outputs.standardized.id}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="font-heading text-lg font-bold">{uiText("ui.inspection_report_76b0f91569")}</h2>
              <OutputGenerationStatus submissionId={submissionId} />
            </div>
          )}

          {(outputs?.vsc || outputs?.standardized) && (
            <div className="space-y-3">
              <h2 className="font-heading text-lg font-bold">{uiText("ui.vsc_coverage_determination_29de4fbf4c")}</h2>
              {outputs?.vsc ? (
                <>
                  <VscCoverageView
                    coverage={outputs.vsc.coverage_data as unknown as VscCoverageData}
                    generatedAt={outputs.vsc.generated_at}
                  />
                  {/* Warranty CTA — only if vehicle is eligible */}
                  {(outputs.vsc.coverage_data as unknown as VscCoverageData).overall_eligibility !== "ineligible" && (
                    <div className="bg-primary-container rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Shield className="h-5 w-5 text-white/80" />
                          <span className="text-xs font-bold uppercase tracking-widest text-white/70">{uiText("ui.coverage_available_07cb10c88c")}</span>
                        </div>
                        <h3 className="text-white font-bold text-lg leading-tight">{uiText("ui.this_vehicle_qualifies_for_a_vehicle_service_46ca2a3457")}</h3>
                        <p className="text-white/70 text-sm mt-1">{uiText("ui.based_on_your_inspection_select_a_plan_to_pr_bcc3bc5290")}</p>
                      </div>
                      {existingWarrantyOption ? (
                        <Button asChild className="shrink-0 bg-white text-primary-container font-bold hover:bg-white/90 rounded-xl">
                          <Link href={`/dashboard/warranty/${existingWarrantyOption.id}`}>{uiText("ui.view_coverage_options_aa246f1586")}</Link>
                        </Button>
                      ) : (
                        <GetCoverageButton vscOutputId={outputs.vsc.id} />
                      )}
                    </div>
                  )}
                </>
              ) : (
                <OutputGenerationStatus submissionId={submissionId} waitFor="both" />
              )}
            </div>
          )}
        </>
      )}

      {/* Raw Results (if submitted) */}
      {isSubmitted && sections.length > 0 && (
        <details className="group">
          <summary className="font-heading text-lg font-bold cursor-pointer list-none flex items-center gap-2">
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />{uiText("ui.raw_inspection_data_79bb4dc3d1")}</summary>
          <div className="space-y-3 mt-3">
            {sections.map((section) => (
              <Card key={section.section_type}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {SECTION_LABELS[section.section_type as SectionType] ?? section.section_type}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {section.answers
                    .filter((a) => a.answer_value)
                    .map((answer, idx) => (
                      <div key={idx} className="flex flex-col gap-0.5">
                        <p className="text-muted-foreground text-xs">{answer.prompt}</p>
                        <p className="font-medium capitalize">
                          {answer.answer_value}
                        </p>
                      </div>
                    ))}
                  {section.notes && (
                    <div>
                      <p className="text-muted-foreground text-xs">{uiText("ui.notes_8a7525b149")}</p>
                      <p className="font-medium">{section.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}

      {/* Draft state — not started yet */}
      {request.status === "draft" && !submission && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">{uiText("ui.inspection_not_started_yet_bd10fd223b")}</p>
            <Button asChild>
              <Link href={`/dashboard/ppi/${id}/inspect`}>{uiText("ui.begin_inspection_0ea1407f6f")}<ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pending assignment */}
      {request.status === "pending_assignment" && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">{uiText("ui.waiting_for_a_technician_to_be_assigned_afe0205333")}</p>
          </CardContent>
        </Card>
      )}

      {["assigned", "accepted"].includes(request.status) && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">{uiText("ui.technician_has_been_assigned_and_will_comple_cd3cd4a308")}</p>
          </CardContent>
        </Card>
      )}

      <div className="border-t pt-3">
        <InspectionDeleteButton inspectionId={id} redirectTo="/dashboard/ppi" />
      </div>
    </div>
  );
}
