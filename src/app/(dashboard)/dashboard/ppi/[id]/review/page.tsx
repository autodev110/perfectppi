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

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function PpiReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; dispute?: string }>;
}) {
  const uiText = await getRequestTranslator();
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
    : uiText("ui.vehicle_a62394ba4a");

  const existingReview = eligibility?.existingReview;
  const serviceDispute = eligibility?.serviceDispute;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={`/dashboard/ppi/${id}`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />{uiText("ui.back_to_inspection_9e8649f821")}</Link>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">
            {existingReview ? uiText("ui.edit_technician_review_9ac9a1ea4c") : uiText("ui.rate_your_technician_2c9b23d348")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{uiText("ui.share_factual_feedback_for_e91ffc6a38")}{vehicleName}{uiText("ui.reviews_are_tied_to_this_completed_inspectio_5669594a11")}</p>
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
              {dispute === "opened" ? uiText("ui.your_concern_was_submitted_privately_for_rev_fc37c7901b") : uiText("ui.the_dispute_was_withdrawn_0ae3aab04f")}
            </div>
          )}

          {!eligibility?.canReview ? (
            <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              {eligibility?.unavailableReason ?? uiText("ui.reviews_can_only_be_created_by_the_requester_bd85b97d42")}
            </div>
          ) : (
            <form action={upsertTechnicianReview} className="space-y-5">
              <input type="hidden" name="ppi_request_id" value={id} />

              <div className="space-y-2">
                <Label htmlFor="rating">{uiText("ui.rating_1_5_c18fb0ded8")}</Label>
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
                <Label htmlFor="title">{uiText("ui.review_title_optional_2c0af9aaf6")}</Label>
                <Input
                  id="title"
                  name="title"
                  maxLength={120}
                  defaultValue={existingReview?.title ?? ""}
                  placeholder={uiText("ui.quick_summary_of_your_experience_0127332612")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">{uiText("ui.detailed_feedback_optional_1feb4cb367")}</Label>
                <Textarea
                  id="content"
                  name="content"
                  rows={6}
                  maxLength={2000}
                  defaultValue={existingReview?.content ?? ""}
                  placeholder={uiText("ui.what_went_well_what_could_be_improved_c038961d65")}
                />
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit">
                  {existingReview ? uiText("ui.update_review_1d002c1e90") : uiText("ui.submit_review_f6cc12201a")}
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href={`/dashboard/ppi/${id}`}>{uiText("ui.cancel_19766ed6cc")}</Link>
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-xl">{uiText("ui.inspection_concern_a1ad5f7396")}</CardTitle>
          <p className="text-sm text-muted-foreground">{uiText("ui.this_is_a_private_support_process_not_a_publ_22e0aa131a")}</p>
        </CardHeader>
        <CardContent>
          {serviceDispute ? (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 text-sm">
                <p className="font-semibold">{serviceDispute.status === "open" ? uiText("ui.under_review_9e8a3b648c") : uiText("ui.dispute_closed_d6526e458d")}</p>
                <p className="mt-1 text-muted-foreground">{SERVICE_DISPUTE_REASON_LABELS[serviceDispute.reason_code as keyof typeof SERVICE_DISPUTE_REASON_LABELS] ?? uiText("ui.inspection_concern_a1ad5f7396")}</p>
                <p className="mt-3 whitespace-pre-wrap">{serviceDispute.details}</p>
                {serviceDispute.resolution_note ? <p className="mt-3 rounded-md bg-muted p-3"><span className="font-semibold">{uiText("ui.resolution_7c144de0a9")}</span> {serviceDispute.resolution_note}</p> : null}
              </div>
              {serviceDispute.status === "open" ? (
                <form action={withdrawPpiServiceDisputeAction}>
                  <input type="hidden" name="ppi_request_id" value={id} />
                  <input type="hidden" name="dispute_id" value={serviceDispute.id} />
                  <Button type="submit" variant="outline">{uiText("ui.withdraw_dispute_6858ebf535")}</Button>
                </form>
              ) : null}
            </div>
          ) : eligibility?.canOpenDispute ? (
            <form action={openPpiServiceDisputeAction} className="space-y-4">
              <input type="hidden" name="ppi_request_id" value={id} />
              <div className="space-y-2">
                <Label htmlFor="reason_code">{uiText("ui.reason_f81ab834de")}</Label>
                <select id="reason_code" name="reason_code" className="h-10 w-full rounded-md border bg-background px-3 text-sm" required>
                  {SERVICE_DISPUTE_REASONS.map((reason) => <option key={reason} value={reason}>{SERVICE_DISPUTE_REASON_LABELS[reason]}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="details">{uiText("ui.what_happened_c4dc542b51")}</Label>
                <Textarea id="details" name="details" minLength={20} maxLength={2000} rows={5} required placeholder={uiText("ui.describe_the_inspection_concern_and_the_outc_85f3e63508")} />
              </div>
              <p className="text-xs text-muted-foreground">{uiText("ui.submit_by_5110b3daaa")}{eligibility.disputeDeadline ? new Intl.DateTimeFormat(uiText("ui.en_dbd3a49d0d"), { dateStyle: "medium" }).format(new Date(eligibility.disputeDeadline)) : uiText("ui.the_end_of_the_dispute_window_cc70cf5a5c")}{uiText("ui.do_not_include_payment_card_details_or_unrel_9b533b13e3")}</p>
              <Button type="submit" variant="outline">{uiText("ui.submit_private_concern_c850b761aa")}</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">{uiText("ui.no_new_dispute_can_be_opened_for_this_inspec_a9964d2479")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
