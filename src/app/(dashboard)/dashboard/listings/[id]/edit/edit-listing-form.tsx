"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateMarketplaceListing } from "@/features/marketplace/actions";
import type { MarketplaceListing } from "@/features/marketplace/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function EditListingForm({ listing }: { listing: MarketplaceListing }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setSaving(true);
    setError(null);
    formData.set("listing_id", listing.id);
    const result = await updateMarketplaceListing(formData);
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    router.push("/dashboard/listings");
    router.refresh();
  }

  return (
    <form action={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="title">Listing title</Label>
        <Input id="title" name="title" defaultValue={listing.title} maxLength={120} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="asking_price">Asking price *</Label>
        <Input id="asking_price" name="asking_price" type="number" min="1" step="1" required defaultValue={listing.asking_price_cents / 100} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input id="location" name="location" defaultValue={listing.location ?? ""} maxLength={120} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" defaultValue={listing.description ?? ""} maxLength={1200} rows={6} />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
