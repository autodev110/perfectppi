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

import { getRequestTranslator } from "@/lib/i18n/server";

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
  const uiText = await getRequestTranslator();
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
          <ArrowLeft className="h-4 w-4" />{uiText("ui.back_to_listing_3bde2c58db")}</Link>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.inspection_sharing_e2ee3d13f5")}</h1>
        <p className="text-muted-foreground">{uiText("ui.share_one_inspection_you_requested_for_this__4e9f8b3930")}</p>
      </div>

      {query.saved ? <p className="rounded-xl bg-teal/10 px-4 py-3 text-sm font-semibold text-teal">{uiText("ui.sharing_updated_377bb33403")}</p> : null}
      {query.error ? <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{query.error}</p> : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-teal" />{uiText("ui.choose_what_to_share_3607f96ef8")}</CardTitle></CardHeader>
        <CardContent>
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">{uiText("ui.no_inspection_is_available_to_share_yet_only_dc79ddcdec")}{" "}
              <Link href="/dashboard/ppi/new" className="font-semibold text-primary">{uiText("ui.request_an_inspection_6de7f68885")}</Link>
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
                        {option.performed_by} · {option.request_status === "completed" ? uiText("ui.completed_22a970d2e5") : uiText("ui.submitted_64900440a8")}{option.attached ? uiText("ui.currently_shared_65ee17cea2") : ""}
                      </span>
                    </span>
                    <Link href={`?preview=${option.request_id}`} className="shrink-0 text-xs font-semibold text-primary">{uiText("ui.preview_324b134f57")}</Link>
                  </label>
                );
              })}
              <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="request_id" value="none" defaultChecked={!attachedId && !previewId} className="mt-1" />
                <span className="font-semibold">{uiText("ui.share_nothing_a51ce3f827")}</span>
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit">{uiText("ui.publish_selection_00acc4636d")}</Button>
                {attachedId ? (
                  <Button type="submit" name="request_id" value="none" variant="outline">{uiText("ui.stop_sharing_b2c78147ed")}</Button>
                ) : null}
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle>{uiText("ui.what_buyers_will_see_f4d7e27bc9")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {previewId === attachedId ? uiText("ui.this_is_the_inspection_currently_shared_on_t_c9ffe84d4e") : uiText("ui.preview_of_the_selected_inspection_nothing_i_b0da63ab7c")}
            </p>
          </CardHeader>
          <CardContent><InspectionReportCard report={preview} preview /></CardContent>
        </Card>
      ) : null}
    </div>
  );
}
