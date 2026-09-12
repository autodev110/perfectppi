import Link from "next/link";
import { notFound } from "next/navigation";
import { getMyMarketplaceListing } from "@/features/marketplace/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LISTING_STATUS_LABELS } from "@/lib/marketplace/listing-status";
import { EditListingForm } from "./edit-listing-form";

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await getMyMarketplaceListing(id);
  if (!listing) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Edit Listing</h1>
        <p className="text-muted-foreground">
          Update the buyer-facing marketplace details. Status: {LISTING_STATUS_LABELS[listing.status]} ·{" "}
          <Link href={`/marketplace/listings/${listing.id}`} className="font-semibold text-primary">Open listing</Link> to pause, mark pending or sold, or remove it.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>{listing.title}</CardTitle></CardHeader>
        <CardContent><EditListingForm listing={listing} /></CardContent>
      </Card>
    </div>
  );
}
