import Link from "next/link";
import { notFound } from "next/navigation";
import { getMyMarketplaceListing } from "@/features/marketplace/queries";
import { attachListingInspectionFromForm } from "@/features/marketplace/actions";
import { getAttachableInspections, getInspectionReport } from "@/features/marketplace/inspection-sharing";
import { InspectionReportCard } from "@/components/shared/inspection-report-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/formatting";
import { inspectionAge, inspectionScopeLabel } from "@/lib/marketplace/inspection-report";
import { ArrowLeft, ClipboardCheck } from "lucide-react";

export const dynamic = "force-dynamic";

// Inspection sharing (plan 25.3): the seller picks one of their own
// inspections and sees exactly what buyers will see — redactions included —
// before publishing it on the listing.
export default async function ListingInspectionSharingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string; saved?: string; error?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const listing = await getMyMarketplaceListing(id);
  if (!listing) notFound();
  const options = await getAttachableInspections(id);
  const attachedId = listing.attached_inspection_id;
  const previewId = query.preview && options.some((option) => option.request_id === query.preview)
    ? query.preview
    : attachedId ?? options[0]?.request_id ?? null;
  const preview = previewId ? await getInspectionReport(previewId) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href={`/marketplace/listings/${id}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />Back to listing
        </Link>
        <h1 className="font-heading text-2xl font-bold">Inspection sharing</h1>
        <p className="text-muted-foreground">
          Share one inspection you requested for this vehicle. Buyers see only the redacted version below — free-text notes, photos, the VIN, and anything naming people, plates, addresses, or phones stay private.
        </p>
      </div>

      {query.saved ? <p className="rounded-xl bg-teal/10 px-4 py-3 text-sm font-semibold text-teal">Sharing updated.</p> : null}
      {query.error ? <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{query.error}</p> : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-teal" />Choose what to share</CardTitle></CardHeader>
        <CardContent>
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No inspection is available to share yet. Only inspections you requested for this vehicle that a technician (or you, as a self-inspection) has submitted can be shared.{" "}
              <Link href="/dashboard/ppi/new" className="font-semibold text-primary">Request an inspection</Link>
            </p>
          ) : (
            <form action={attachListingInspectionFromForm} className="space-y-3">
              <input type="hidden" name="listing_id" value={id} />
              {options.map((option) => {
                const age = inspectionAge(option.inspected_at);
                return (
                  <label key={option.request_id} className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input type="radio" name="request_id" value={option.request_id} defaultChecked={option.request_id === previewId} className="mt-1" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{inspectionScopeLabel(option.scope)} · {formatDate(option.inspected_at)} ({age.label})</span>
                      <span className="block text-xs text-muted-foreground">
                        {option.performed_by} · {option.request_status === "completed" ? "Completed" : "Submitted"}{option.attached ? " · Currently shared" : ""}
                      </span>
                    </span>
                    <Link href={`?preview=${option.request_id}`} className="shrink-0 text-xs font-semibold text-primary">Preview</Link>
                  </label>
                );
              })}
              <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="request_id" value="none" defaultChecked={!attachedId && !previewId} className="mt-1" />
                <span className="font-semibold">Share nothing</span>
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit">Publish selection</Button>
                {attachedId ? (
                  <Button type="submit" name="request_id" value="none" variant="outline">Stop sharing</Button>
                ) : null}
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>What buyers will see</CardTitle>
            <p className="text-sm text-muted-foreground">
              {previewId === attachedId ? "This is the inspection currently shared on the listing." : "Preview of the selected inspection. Nothing is published until you press Publish selection."}
            </p>
          </CardHeader>
          <CardContent><InspectionReportCard report={preview} preview /></CardContent>
        </Card>
      ) : null}
    </div>
  );
}
