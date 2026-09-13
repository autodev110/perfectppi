import Link from "next/link";
import { notFound } from "next/navigation";
import { getPpiRequest } from "@/features/ppi/queries";
import { upsertTechnicianReview } from "@/features/reviews/actions";
import { getReviewEligibilityForRequest } from "@/features/reviews/queries";
import {
  openPpiServiceDisputeAction,
  SERVICE_DISPUTE_REASONS,
  SERVICE_DISPUTE_REASON_LABELS,
  withdrawPpiServiceDisputeAction,
} from "@/features/reviews/disputes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlertCircle, ChevronLeft, Star } from "lucide-react";

export default async function PpiReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; dispute?: string }>;
}) {
  const { id } = await params;
  const { error, dispute } = await searchParams;

  const [request, eligibility] = await Promise.all([
    getPpiRequest(id),
    getReviewEligibilityForRequest(id),
  ]);

  if (!request) notFound();

  const vehicle = request.vehicle as {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
  } | null;

  const vehicleName = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ")
    : "Vehicle";

  const existingReview = eligibility?.existingReview;
  const serviceDispute = eligibility?.serviceDispute;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={`/dashboard/ppi/${id}`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Inspection
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">
            {existingReview ? "Edit Technician Review" : "Rate Your Technician"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Share factual feedback for {vehicleName}. Reviews are tied to this completed inspection.
          </p>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <p>{decodeURIComponent(error)}</p>
            </div>
          )}
          {dispute && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {dispute === "opened" ? "Your concern was submitted privately for review." : "The dispute was withdrawn."}
            </div>
          )}

          {!eligibility?.canReview ? (
            <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              {eligibility?.unavailableReason ?? "Reviews can only be created by the requester after a technician-completed inspection reaches completed status."}
            </div>
          ) : (
            <form action={upsertTechnicianReview} className="space-y-5">
              <input type="hidden" name="ppi_request_id" value={id} />

              <div className="space-y-2">
                <Label htmlFor="rating">Rating (1-5)</Label>
                <div className="relative max-w-[160px]">
                  <Input
                    id="rating"
                    name="rating"
                    type="number"
                    min={1}
                    max={5}
                    step={1}
                    required
                    defaultValue={existingReview?.rating ?? 5}
                    className="pr-9"
                  />
                  <Star className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Review Title (optional)</Label>
                <Input
                  id="title"
                  name="title"
                  maxLength={120}
                  defaultValue={existingReview?.title ?? ""}
                  placeholder="Quick summary of your experience"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Detailed Feedback (optional)</Label>
                <Textarea
                  id="content"
                  name="content"
                  rows={6}
                  maxLength={2000}
                  defaultValue={existingReview?.content ?? ""}
                  placeholder="What went well? What could be improved?"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit">
                  {existingReview ? "Update Review" : "Submit Review"}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href={`/dashboard/ppi/${id}`}>Cancel</Link>
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">Inspection concern</CardTitle>
          <p className="text-sm text-muted-foreground">
            This is a private support process, not a public review. Opening a dispute temporarily hides an existing review until an administrator completes the review.
          </p>
        </CardHeader>
        <CardContent>
          {serviceDispute ? (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 text-sm">
                <p className="font-semibold">{serviceDispute.status === "open" ? "Under review" : "Dispute closed"}</p>
                <p className="mt-1 text-muted-foreground">{SERVICE_DISPUTE_REASON_LABELS[serviceDispute.reason_code as keyof typeof SERVICE_DISPUTE_REASON_LABELS] ?? "Inspection concern"}</p>
                <p className="mt-3 whitespace-pre-wrap">{serviceDispute.details}</p>
                {serviceDispute.resolution_note ? <p className="mt-3 rounded-md bg-muted p-3"><span className="font-semibold">Resolution:</span> {serviceDispute.resolution_note}</p> : null}
              </div>
              {serviceDispute.status === "open" ? (
                <form action={withdrawPpiServiceDisputeAction}>
                  <input type="hidden" name="ppi_request_id" value={id} />
                  <input type="hidden" name="dispute_id" value={serviceDispute.id} />
                  <Button type="submit" variant="outline">Withdraw dispute</Button>
                </form>
              ) : null}
            </div>
          ) : eligibility?.canOpenDispute ? (
            <form action={openPpiServiceDisputeAction} className="space-y-4">
              <input type="hidden" name="ppi_request_id" value={id} />
              <div className="space-y-2">
                <Label htmlFor="reason_code">Reason</Label>
                <select id="reason_code" name="reason_code" className="h-10 w-full rounded-md border bg-background px-3 text-sm" required>
                  {SERVICE_DISPUTE_REASONS.map((reason) => <option key={reason} value={reason}>{SERVICE_DISPUTE_REASON_LABELS[reason]}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="details">What happened?</Label>
                <Textarea id="details" name="details" minLength={20} maxLength={2000} rows={5} required placeholder="Describe the inspection concern and the outcome you are requesting." />
              </div>
              <p className="text-xs text-muted-foreground">Submit by {eligibility.disputeDeadline ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(eligibility.disputeDeadline)) : "the end of the dispute window"}. Do not include payment-card details or unrelated sensitive information.</p>
              <Button type="submit" variant="outline">Submit private concern</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">No new dispute can be opened for this inspection.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
