"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createCommunityPost } from "@/features/community/actions";
import type { CommunityPostOptionListing, CommunityPostOptionVehicle } from "@/features/community/queries";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils/formatting";
import { uploadFile } from "@/features/uploads/client";
import { ImagePlus, Trash2, Video } from "lucide-react";

const MAX_MEDIA = 10;

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
  const [media, setMedia] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // A failed media upload leaves the post already created — retrying the form
  // must attach to that post rather than publish a second one.
  const createdPostId = useRef<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    if (attachmentType !== "vehicle") formData.set("vehicle_id", "");
    if (attachmentType !== "listing") formData.set("listing_id", "");

    let postId = createdPostId.current;
    if (!postId) {
      const result = await createCommunityPost(formData);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
        return;
      }
      postId = result.data?.id ?? null;
      createdPostId.current = postId;
    }

    if (postId && media.length > 0) {
      const targetPostId = postId;
      try {
        const uploaded = await Promise.all(
          media.map(async (file, sortOrder) => ({
            url: await uploadFile(file, "community_post", targetPostId),
            mediaType: file.type.startsWith("video/") ? "video" : "image",
            contentType: file.type,
            sortOrder,
          })),
        );
        const response = await fetch(`/api/community/posts/${targetPostId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: uploaded }),
        });
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error ?? "Could not attach media");
        }
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Could not upload media");
        setLoading(false);
        return;
      }
    }

    router.push("/dashboard/posts");
    router.refresh();
  }

  function addMedia(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files).filter(
      (file) => file.type.startsWith("image/") || file.type.startsWith("video/"),
    );
    const available = Math.max(0, MAX_MEDIA - media.length);
    if (selected.length > available) {
      setError(`Posts can include up to ${MAX_MEDIA} photos or videos`);
    }
    setMedia((current) => [...current, ...selected.slice(0, available)]);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="post-media">Photos and videos</Label>
            <p className="text-xs text-muted-foreground">Add up to 10 items. Their order becomes the carousel order.</p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">{media.length}/{MAX_MEDIA}</span>
        </div>
        <input
          ref={fileInputRef}
          id="post-media"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime"
          multiple
          className="sr-only"
          onChange={(event) => addMedia(event.target.files)}
        />
        <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={media.length >= MAX_MEDIA}>
          <ImagePlus className="mr-2 h-4 w-4" />
          Add Media
        </Button>
        {media.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {media.map((file, index) => (
              <MediaPreview
                key={`${file.name}-${file.lastModified}-${index}`}
                file={file}
                index={index}
                onRemove={() => setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              />
            ))}
          </div>
        ) : null}
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

function MediaPreview({ file, index, onRemove }: { file: File; index: number; onRemove: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
      {/* The object URL only exists after the effect runs — an empty `src`
          would otherwise make the browser re-request the current page. */}
      {url ? (
        file.type.startsWith("video/") ? (
          <video src={url} className="h-full w-full object-cover" muted playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Selected media ${index + 1}`} className="h-full w-full object-cover" />
        )
      ) : null}
      <span className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-bold text-white">
        {file.type.startsWith("video/") ? <Video className="h-3 w-3" /> : index + 1}
      </span>
      <Button type="button" size="icon" variant="destructive" className="absolute right-2 top-2 h-8 w-8 rounded-full" onClick={onRemove} aria-label={`Remove media ${index + 1}`}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
