import Link from "next/link";
import { notFound } from "next/navigation";
import { getMyMarketplaceListing } from "@/features/marketplace/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LISTING_STATUS_LABELS } from "@/lib/marketplace/listing-status";
import { EditListingForm } from "./edit-listing-form";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const uiText = await getRequestTranslator();
  const { id } = await params;
  const listing = await getMyMarketplaceListing(id);
  if (!listing) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.edit_listing_fc1d34745a")}</h1>
        <p className="text-muted-foreground">{uiText("ui.update_the_buyer_facing_marketplace_details__11d8d376a8")}{LISTING_STATUS_LABELS[listing.status]} ·{" "}
          <Link href={`/marketplace/listings/${listing.id}`} className="font-semibold text-primary">{uiText("ui.open_listing_5ba1797eb1")}</Link>{uiText("ui.to_pause_mark_pending_or_sold_or_remove_it_9f299d5151")}</p>
      </div>
      <Card>
        <CardHeader><CardTitle>{listing.title}</CardTitle></CardHeader>
        <CardContent><EditListingForm listing={listing} /></CardContent>
      </Card>
    </div>
  );
}
