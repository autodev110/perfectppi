"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCommunityPost } from "@/features/community/actions";
import type { CommunityPostOptionListing, CommunityPostOptionVehicle } from "@/features/community/queries";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils/formatting";

type NewPostFormProps = {
  vehicles: CommunityPostOptionVehicle[];
  listings: CommunityPostOptionListing[];
};

function vehicleLabel(vehicle: CommunityPostOptionVehicle | null) {
  return [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ") || "Vehicle";
}

export function NewPostForm({ vehicles, listings }: NewPostFormProps) {
  const router = useRouter();
  const [attachmentType, setAttachmentType] = useState("none");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    if (attachmentType !== "vehicle") formData.set("vehicle_id", "");
    if (attachmentType !== "listing") formData.set("listing_id", "");

    const result = await createCommunityPost(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push("/dashboard/posts");
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="content">Post *</Label>
        <Textarea
          id="content"
          name="content"
          rows={7}
          maxLength={1200}
          required
          placeholder="Share a vehicle update, listing context, or inspection question. Keep it factual and tied to what you can verify."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="attachment_type">Attach context</Label>
        <select
          id="attachment_type"
          value={attachmentType}
          onChange={(event) => setAttachmentType(event.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="none">No attachment</option>
          <option value="vehicle">Public vehicle profile</option>
          <option value="listing">Active marketplace listing</option>
        </select>
      </div>

      {attachmentType === "vehicle" && (
        <div className="space-y-2">
          <Label htmlFor="vehicle_id">Public vehicle</Label>
          <select
            id="vehicle_id"
            name="vehicle_id"
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">Choose a public vehicle</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicleLabel(vehicle)}{vehicle.vin ? ` · ${vehicle.vin}` : ""}
              </option>
            ))}
          </select>
          {vehicles.length === 0 && (
            <p className="text-xs text-muted-foreground">Make a vehicle public first if you want to attach it.</p>
          )}
        </div>
      )}

      {attachmentType === "listing" && (
        <div className="space-y-2">
          <Label htmlFor="listing_id">Active listing</Label>
          <select
            id="listing_id"
            name="listing_id"
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">Choose an active listing</option>
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.title} · {vehicleLabel(listing.vehicle)} · {formatCurrency(listing.asking_price_cents)}
              </option>
            ))}
          </select>
          {listings.length === 0 && (
            <p className="text-xs text-muted-foreground">Create an active marketplace listing first if you want to share one.</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>{loading ? "Publishing..." : "Publish Post"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
