import { getPpiRequest, getCurrentSubmission, getPpiSubmissionVersions } from "@/features/ppi/queries";
import { PpiStatusBadge } from "@/components/shared/ppi-status-badge";
import { PpiBadge } from "@/components/shared/ppi-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Car, Calendar, User, ChevronRight, FileText } from "lucide-react";
import { SECTION_LABELS } from "@/features/ppi/constants";
import type { SectionType } from "@/types/enums";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InspectionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [request, submission, versions] = await Promise.all([
    getPpiRequest(id),
    getCurrentSubmission(id),
    getPpiSubmissionVersions(id),
  ]);

  if (!request) notFound();

  const vehicle = request.vehicle as {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    mileage: number | null;
  } | null;

  const vehicleName = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ")
    : "Unknown Vehicle";

  const canContinue = ["draft", "in_progress"].includes(request.status);
  const canEdit = ["submitted", "completed"].includes(request.status);
  const isSubmitted = ["submitted", "completed"].includes(request.status);

  const sections = (submission as { sections?: { section_type: string; notes: string | null; answers: { prompt: string; answer_value: string | null; answer_type: string }[] }[] } | null)?.sections ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h1 className="font-heading text-2xl font-bold">{vehicleName}</h1>
            <PpiBadge type={request.ppi_type} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PpiStatusBadge status={request.status} />
            {versions.length > 1 && (
              <span className="text-xs text-muted-foreground">
                v{versions[0]?.version ?? 1} (latest)
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {canContinue && submission && (
            <Button asChild>
              <Link href={`/dashboard/ppi/${id}/inspect?sub=${submission.id}`}>
                Continue Inspection
              </Link>
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" asChild>
              <Link href={`/dashboard/ppi/${id}/edit`}>Edit & Resubmit</Link>
            </Button>
          )}
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
            <p className="text-muted-foreground">Your Role</p>
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
          {request.assigned_tech && (
            <div>
              <p className="text-muted-foreground flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> Assigned Tech
              </p>
              <p className="font-medium">
                {(request.assigned_tech as { display_name: string | null }).display_name ?? "Technician"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results (if submitted) */}
      {isSubmitted && sections.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-heading text-lg font-bold">Inspection Results</h2>
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
                    <p className="text-muted-foreground text-xs">Notes</p>
                    <p className="font-medium">{section.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Draft state — not started yet */}
      {request.status === "draft" && !submission && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">
              Inspection not started yet.
            </p>
            <Button asChild>
              <Link href={`/dashboard/ppi/${id}/inspect`}>
                Begin Inspection <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pending assignment */}
      {request.status === "pending_assignment" && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">
              Waiting for a technician to be assigned.
            </p>
          </CardContent>
        </Card>
      )}

      {["assigned", "accepted"].includes(request.status) && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              Technician has been assigned and will complete the inspection.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
