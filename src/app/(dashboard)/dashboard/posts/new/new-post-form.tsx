"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createCommunityPost } from "@/features/community/actions";
import type {
  CommunityPostOptionGroup,
  CommunityPostOptionListing,
  CommunityPostOptionVehicle,
} from "@/features/community/queries";
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
  groups: CommunityPostOptionGroup[];
  selectedVehicleId?: string;
  selectedGroupSlug?: string;
  defaultAudience: "public" | "friends";
  canPostPublic: boolean;
  /** Server capabilities (plan 30.2); presentation only, the API re-checks. */
  capabilities: {
    communityTextPosts: boolean;
    communityPhotoUploads: boolean;
    communityVideoUploads: boolean;
  };
};

function vehicleLabel(vehicle: CommunityPostOptionVehicle | null) {
  return [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ") || "Vehicle";
}

export function NewPostForm({
  vehicles,
  listings,
  groups,
  selectedVehicleId,
  selectedGroupSlug,
  defaultAudience,
  canPostPublic,
  capabilities,
}: NewPostFormProps) {
  const videoAllowed = capabilities.communityVideoUploads;
  const mediaAllowed = capabilities.communityPhotoUploads;
  const acceptTypes = videoAllowed
    ? "image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime"
    : "image/jpeg,image/png,image/webp,image/heic,image/heif";
  const router = useRouter();
  const requestedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId);
  const [attachmentType, setAttachmentType] = useState(requestedVehicle ? "vehicle" : "none");
  const requestedGroup = groups.find((group) => group.slug === selectedGroupSlug);
  const [groupId, setGroupId] = useState(requestedGroup?.id ?? "");
  const [audience, setAudience] = useState<"public" | "friends">(
    canPostPublic ? defaultAudience : "friends",
  );
  const [postType, setPostType] = useState<"general" | "question">("general");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [media, setMedia] = useState<File[]>([]);
  const [progress, setProgress] = useState<number[]>([]);
  const [draftLocked, setDraftLocked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The token and hidden post id survive upload retries without creating a
  // second server-side assembly.
  const creationToken = useRef<string | null>(null);
  const createdPostId = useRef<string | null>(null);
  const createdModerationStatus = useRef<string | null>(null);
  const uploadedMedia = useRef<Array<{
    url: string;
    mediaType: "image" | "video";
    contentType: string;
    sortOrder: number;
  }> | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    if (attachmentType !== "vehicle") formData.set("vehicle_id", "");
    if (attachmentType !== "listing") formData.set("listing_id", "");
    formData.set("expected_media_count", String(media.length));
    if (media.length > 0) {
      creationToken.current ??= crypto.randomUUID();
      formData.set("creation_token", creationToken.current);
    }

    let postId = createdPostId.current;
    if (!postId) {
      const result = await createCommunityPost(formData);
      if (result.error !== undefined) {
        setError(result.error);
        setLoading(false);
        return;
      }
      postId = result.data.id;
      createdPostId.current = postId;
      createdModerationStatus.current = result.data.moderationStatus;
      if (media.length > 0) setDraftLocked(true);
    }

    if (postId && media.length > 0) {
      const targetPostId = postId;
      setProgress(media.map(() => uploadedMedia.current ? 1 : 0));
      try {
        const uploaded = uploadedMedia.current ?? await Promise.all(
          media.map(async (file, sortOrder) => ({
            url: await uploadFile(file, "community_post", targetPostId, (fraction) =>
              setProgress((current) => {
                const next = [...current];
                next[sortOrder] = fraction;
                return next;
              }),
            ),
            mediaType: file.type.startsWith("video/") ? "video" as const : "image" as const,
            contentType: file.type,
            sortOrder,
          })),
        );
        uploadedMedia.current = uploaded;
        const response = await fetch(`/api/community/posts/${targetPostId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: uploaded, creationToken: creationToken.current }),
        });
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error ?? "Could not attach media");
        }
        const finalizeResponse = await fetch(`/api/community/posts/${targetPostId}/finalize`, {
          method: "POST",
        });
        const finalized = await finalizeResponse.json();
        if (!finalizeResponse.ok || !finalized.data) {
          throw new Error(finalized.error ?? "Could not finalize post");
        }
        createdModerationStatus.current = finalized.data.moderationStatus;
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Could not upload media");
        setProgress([]);
        setLoading(false);
        return;
      }
    }

    const destinationGroup = groups.find((group) => group.id === groupId);
    router.push(createdModerationStatus.current === "active"
      ? destinationGroup ? `/community/groups/${destinationGroup.slug}` : "/dashboard/posts"
      : "/dashboard/posts?tab=review");
    router.refresh();
  }

  function addMedia(files: FileList | null) {
    if (!files || draftLocked) return;
    const chosen = Array.from(files);
    if (!videoAllowed && chosen.some((file) => file.type.startsWith("video/"))) {
      setError("Video posts are coming later. Please choose photos only.");
    }
    const selected = chosen.filter(
      (file) => file.type.startsWith("image/") || (videoAllowed && file.type.startsWith("video/")),
    );
    const available = Math.max(0, MAX_MEDIA - media.length);
    if (selected.length > available) {
      setError(`Posts can include up to ${MAX_MEDIA} ${videoAllowed ? "photos or videos" : "photos"}`);
    }
    setMedia((current) => [...current, ...selected.slice(0, available)]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const uploading = loading && progress.length > 0;
  const overallProgress = progress.length
    ? progress.reduce((total, value) => total + value, 0) / progress.length
    : 0;

  return (
    <form action={handleSubmit} className="space-y-5">
      <fieldset disabled={draftLocked} className="contents">
      <div className="space-y-2">
        <Label htmlFor="group_id">Post destination</Label>
        <select
          id="group_id"
          name="group_id"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        >
          <option value="">My feed</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">
          {groups.length ? "Only groups you have joined appear here." : "Join a Community group to post there."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="audience">Audience</Label>
        <select
          id="audience"
          name="audience"
          value={groupId ? "public" : audience}
          onChange={(event) => setAudience(event.target.value as "public" | "friends")}
          disabled={Boolean(groupId)}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        >
          <option value="friends">Friends</option>
          {canPostPublic ? <option value="public">Public inside PerfectPPI</option> : null}
        </select>
        {groupId ? <input type="hidden" name="audience" value="public" /> : null}
        <p className="text-xs text-muted-foreground">
          {groupId
            ? "Public group posts are visible to eligible signed-in PerfectPPI members."
            : canPostPublic ? "Public posts are visible only to signed-in PerfectPPI members." : "Your private profile can publish to Friends only."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="post_type">Post type</Label>
        <select
          id="post_type"
          name="post_type"
          value={postType}
          onChange={(event) => setPostType(event.target.value as "general" | "question")}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        >
          <option value="general">General post</option>
          <option value="question">Question / troubleshooting</option>
        </select>
        <p className="text-xs text-muted-foreground">
          {postType === "question"
            ? "Responses can be marked as the accepted answer after publishing."
            : "Use Question / troubleshooting when you want members to help solve a specific issue."}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">{postType === "question" ? "Question" : "Post"} *</Label>
        <Textarea
          id="content"
          name="content"
          rows={7}
          maxLength={1200}
          required
          placeholder={postType === "question"
            ? "Describe the symptoms, when they happen, and what you have already checked."
            : "Share a vehicle update, listing context, or inspection discussion. Keep it factual and tied to what you can verify."}
        />
      </div>

      {mediaAllowed ? <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="post-media">{videoAllowed ? "Photos and videos" : "Photos"}</Label>
            <p className="text-xs text-muted-foreground">Add up to 10 photos. Their order becomes the carousel order.</p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">{media.length}/{MAX_MEDIA}</span>
        </div>
        <input
          ref={fileInputRef}
          id="post-media"
          type="file"
          accept={acceptTypes}
          multiple
          className="sr-only"
          onChange={(event) => addMedia(event.target.files)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || media.length >= MAX_MEDIA}
          >
            <ImagePlus className="mr-2 h-4 w-4" />
            {videoAllowed ? "Add Media" : "Add Photos"}
          </Button>
          {uploading ? (
            <span className="text-xs font-medium text-muted-foreground">
              Uploading media… {Math.round(overallProgress * 100)}%
            </span>
          ) : null}
        </div>
        {media.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {media.map((file, index) => (
              <MediaPreview
                key={`${file.name}-${file.lastModified}-${index}`}
                file={file}
                index={index}
                progress={uploading ? progress[index] ?? 0 : null}
                onRemove={() => setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              />
            ))}
          </div>
        ) : null}
      </div> : (
        <p className="text-xs text-muted-foreground">Photo uploads are temporarily unavailable. You can still post text.</p>
      )}

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
            defaultValue={requestedVehicle?.id ?? ""}
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
      </fieldset>

      {draftLocked && error ? (
        <p className="text-xs text-muted-foreground">
          Your private post draft is saved. Retry publishing to continue the same upload without creating a duplicate.
        </p>
      ) : null}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>{loading ? "Publishing..." : "Publish Post"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}

function MediaPreview({
  file,
  index,
  progress,
  onRemove,
}: {
  file: File;
  index: number;
  progress: number | null;
  onRemove: () => void;
}) {
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
      {progress === null ? (
        <Button type="button" size="icon" variant="destructive" className="absolute right-2 top-2 h-8 w-8 rounded-full" onClick={onRemove} aria-label={`Remove media ${index + 1}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/40">
          <div
            className="h-full bg-primary transition-[width] duration-150"
            style={{ width: `${Math.round(progress * 100)}%` }}
            role="progressbar"
            aria-label={`Upload progress for media ${index + 1}`}
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}
    </div>
  );
}
