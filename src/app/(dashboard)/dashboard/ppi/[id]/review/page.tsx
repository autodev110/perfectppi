import Link from "next/link";
import { notFound } from "next/navigation";
import { getPpiRequest } from "@/features/ppi/queries";
import { upsertTechnicianReview } from "@/features/reviews/actions";
import { getReviewEligibilityForRequest } from "@/features/reviews/queries";
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
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

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

          {!eligibility?.canReview ? (
            <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              Reviews can only be created by the requester after a technician-completed inspection reaches
              <span className="font-semibold"> completed</span> status.
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
    </div>
  );
}
