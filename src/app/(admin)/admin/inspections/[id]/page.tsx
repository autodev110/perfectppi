import { getAdminInspectionDetail } from "@/features/admin/queries";
import { requireRole } from "@/features/auth/guards";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PpiBadge } from "@/components/shared/ppi-badge";
import { PpiStatusBadge } from "@/components/shared/ppi-status-badge";
import { StandardizedOutputView } from "@/components/shared/standardized-output-view";
import { VscCoverageView } from "@/components/shared/vsc-coverage-view";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDate, getInitials } from "@/lib/utils/formatting";
import { SECTION_LABELS } from "@/features/ppi/constants";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Car, ChevronRight, FileText, User } from "lucide-react";
import type { SectionType } from "@/types/enums";
import type { StandardizedContent, VscCoverageData } from "@/types/api";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminInspectionDetailPage({ params }: PageProps) {
  await requireRole(["admin"]);
  const { id } = await params;

  const result = await getAdminInspectionDetail(id);
  if (!result) notFound();

  const { request, submission, outputs } = result;

  const vehicle = request.vehicle as {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    mileage: number | null;
  } | null;

  const requester = request.requester as { id: string; display_name: string | null; username: string | null } | null;
  const assignedTech = request.assigned_tech as { id: string; display_name: string | null; username: string | null } | null;
  const performer = submission?.performer as { id: string; display_name: string | null; username: string | null } | null;

  const vehicleName = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ")
    : "Unknown Vehicle";

  const isSubmitted = ["submitted", "completed"].includes(request.status);
  const sections = (submission as { sections?: { section_type: string; notes: string | null; answers: { prompt: string; answer_value: string | null; answer_type: string }[] }[] } | null)?.sections ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back */}
      <Link
        href="/admin/inspections"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Inspections
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h1 className="font-heading text-2xl font-bold">{vehicleName}</h1>
            <PpiBadge type={request.ppi_type} />
          </div>
          <PpiStatusBadge status={request.status} />
        </div>
      </div>

      {/* Vehicle details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" /> Vehicle Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          {vehicle?.vin && (
            <div>
              <p className="text-muted-foreground">VIN</p>
              <p className="font-mono font-medium">{vehicle.vin}</p>
            </div>
          )}
          {vehicle?.mileage && (
            <div>
              <p className="text-muted-foreground">Mileage</p>
              <p className="font-medium">{vehicle.mileage.toLocaleString()} mi</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Whose Car</p>
            <p className="font-medium capitalize">{request.whose_car}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Requester Role</p>
            <p className="font-medium capitalize">{request.requester_role}</p>
          </div>
        </CardContent>
      </Card>

      {/* Inspection meta */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> Inspection Info
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Type</p>
            <PpiBadge type={request.ppi_type} className="mt-1" />
          </div>
          <div>
            <p className="text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> Created
            </p>
            <p className="font-medium">
              {new Date(request.created_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          {requester && (
            <div>
              <p className="text-muted-foreground flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> Requester
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px]">
                    {getInitials(requester.display_name ?? "U")}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium">
                  {requester.display_name ?? requester.username ?? "—"}
                </span>
              </div>
            </div>
          )}
          {performer ? (
            <div>
              <p className="text-muted-foreground flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> Performer
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px]">
                    {getInitials(performer.display_name ?? "T")}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium">
                  {performer.display_name ?? performer.username ?? "—"}
                </span>
              </div>
            </div>
          ) : assignedTech ? (
            <div>
              <p className="text-muted-foreground flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> Assigned Tech
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-[10px]">
                    {getInitials(assignedTech.display_name ?? "T")}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium">
                  {assignedTech.display_name ?? assignedTech.username ?? "—"}
                </span>
              </div>
            </div>
          ) : null}
          {submission?.submitted_at && (
            <div>
              <p className="text-muted-foreground">Submitted</p>
              <p className="font-medium">{formatDate(submission.submitted_at)}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">Performer Type</p>
            <p className="font-medium capitalize">{request.performer_type}</p>
          </div>
        </CardContent>
      </Card>

      {/* AI Outputs */}
      {isSubmitted && submission && (
        <>
          {outputs.standardized ? (
            <div className="space-y-3">
              <h2 className="font-heading text-lg font-bold">Inspection Report</h2>
              <StandardizedOutputView
                content={outputs.standardized.structured_content as unknown as StandardizedContent}
                generatedAt={outputs.standardized.generated_at}
                documentUrl={outputs.standardized.document_url ? `/api/outputs/${outputs.standardized.id}/pdf` : null}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="font-heading text-lg font-bold">Inspection Report</h2>
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Output not yet generated.
                </CardContent>
              </Card>
            </div>
          )}

          {(outputs.vsc || outputs.standardized) && (
            <div className="space-y-3">
              <h2 className="font-heading text-lg font-bold">VSC Coverage Determination</h2>
              {outputs.vsc ? (
                <VscCoverageView
                  coverage={outputs.vsc.coverage_data as unknown as VscCoverageData}
                  generatedAt={outputs.vsc.generated_at}
                />
              ) : (
                <Card>
                  <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    VSC output not yet generated.
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}

      {/* Raw Inspection Data */}
      {isSubmitted && sections.length > 0 && (
        <details className="group">
          <summary className="font-heading text-lg font-bold cursor-pointer list-none flex items-center gap-2">
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
            Raw Inspection Data
          </summary>
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
                        <p className="font-medium capitalize">{answer.answer_value}</p>
                      </div>
                    ))}
                  {section.notes && (
                    <div>
                      <p className="text-muted-foreground text-xs">Notes</p>
                      <p className="font-medium">{section.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </details>
      )}

      {/* Not yet submitted */}
      {!isSubmitted && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Badge variant="outline" className="mb-3">
              {request.status.replace(/_/g, " ")}
            </Badge>
            <p className="text-muted-foreground text-sm">
              This inspection has not been submitted yet. No output to display.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
