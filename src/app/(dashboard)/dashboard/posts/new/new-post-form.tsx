"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createCommunityPost } from "@/features/community/actions";
import type {
  CommunityPostOptionGroup,
  CommunityPostOptionInspection,
  CommunityPostOptionListing,
  CommunityPostOptionVehicle,
} from "@/features/community/queries";
import { POST_TYPES, POST_TYPE_LABELS, type PostType } from "@/lib/community/post-types";
import { EMPTY_POST_TYPE_FIELDS, PostTypeFields, detailsFromFields, type PostTypeFieldState } from "@/components/shared/post-type-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils/formatting";
import { uploadFile } from "@/features/uploads/client";
import { ImagePlus, Trash2, Video } from "lucide-react";
import { t as uiText } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

const MAX_MEDIA = 10;

type NewPostFormProps = {
  vehicles: CommunityPostOptionVehicle[];
  listings: CommunityPostOptionListing[];
  groups: CommunityPostOptionGroup[];
  inspections?: CommunityPostOptionInspection[];
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
  eventPhotoContext?: {
    id: string;
    title: string;
    groupId: string | null;
    groupSlug: string | null;
  } | null;
};

function vehicleLabel(vehicle: CommunityPostOptionVehicle | null) {
  return [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ") || uiText("ui.vehicle_a62394ba4a");
}

export function NewPostForm({
  vehicles,
  listings,
  groups,
  inspections = [],
  selectedVehicleId,
  selectedGroupSlug,
  defaultAudience,
  canPostPublic,
  capabilities,
  eventPhotoContext,
}: NewPostFormProps) {
  const uiText = useTranslator();
  const videoAllowed = capabilities.communityVideoUploads && !eventPhotoContext;
  const mediaAllowed = capabilities.communityPhotoUploads;
  const acceptTypes = videoAllowed
    ? "image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime"
    : "image/jpeg,image/png,image/webp,image/heic,image/heif";
  const router = useRouter();
  const requestedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId);
  const [attachmentType, setAttachmentType] = useState(requestedVehicle ? "vehicle" : "none");
  const requestedGroup = groups.find((group) => group.slug === selectedGroupSlug);
  const [groupId, setGroupId] = useState(eventPhotoContext?.groupId ?? requestedGroup?.id ?? "");
  const [audience, setAudience] = useState<"public" | "friends">(
    canPostPublic ? defaultAudience : "friends",
  );
  const [postType, setPostType] = useState<PostType>("general");
  const [typeFields, setTypeFields] = useState<PostTypeFieldState>(EMPTY_POST_TYPE_FIELDS);
  const [vehicleId, setVehicleId] = useState(requestedVehicle?.id ?? "");
  const [listingId, setListingId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [media, setMedia] = useState<File[]>([]);
  const [mediaDescriptions, setMediaDescriptions] = useState<string[]>([]);
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
    altText: string | null;
  }> | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    if (eventPhotoContext && media.length === 0) {
      setError(uiText("ui.add_at_least_one_photo_from_the_event_fe98bd4c56"));
      setLoading(false);
      return;
    }

    if (attachmentType !== "vehicle") formData.set("vehicle_id", "");
    if (attachmentType !== "listing") formData.set("listing_id", "");
    formData.set("details", JSON.stringify(detailsFromFields(postType, typeFields)));
    formData.set("expected_media_count", String(media.length));
    if (eventPhotoContext) formData.set("event_id", eventPhotoContext.id);
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
            altText: file.type.startsWith("image/") ? mediaDescriptions[sortOrder]?.trim() || null : null,
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
          throw new Error(payload.error ?? uiText("ui.could_not_attach_media_05dd9a72a3"));
        }
        const finalizeResponse = await fetch(`/api/community/posts/${targetPostId}/finalize`, {
          method: "POST",
        });
        const finalized = await finalizeResponse.json();
        if (!finalizeResponse.ok || !finalized.data) {
          throw new Error(finalized.error ?? uiText("ui.could_not_finalize_post_1454a82a8c"));
        }
        createdModerationStatus.current = finalized.data.moderationStatus;
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : uiText("ui.could_not_upload_media_86b00c9cce"));
        setProgress([]);
        setLoading(false);
        return;
      }
    }

    const destinationGroup = groups.find((group) => group.id === groupId);
    router.push(createdModerationStatus.current === "active"
      ? eventPhotoContext ? `/community/events/${eventPhotoContext.id}`
        : destinationGroup ? `/community/groups/${destinationGroup.slug}` : "/dashboard/posts"
      : "/dashboard/posts?tab=review");
    router.refresh();
  }

  function addMedia(files: FileList | null) {
    if (!files || draftLocked) return;
    const chosen = Array.from(files);
    if (!videoAllowed && chosen.some((file) => file.type.startsWith("video/"))) {
      setError(uiText("ui.video_posts_are_coming_later_please_choose_p_baf97f607e"));
    }
    const selected = chosen.filter(
      (file) => file.type.startsWith("image/") || (videoAllowed && file.type.startsWith("video/")),
    );
    const available = Math.max(0, MAX_MEDIA - media.length);
    if (selected.length > available) {
      setError(uiText("ui.posts_can_include_up_to_0b085abfa9", { arg0: String(MAX_MEDIA), arg1: String(videoAllowed ? uiText("ui.photos_or_videos_e5b05de8b9") : "photos") }));
    }
    setMedia((current) => [...current, ...selected.slice(0, available)]);
    setMediaDescriptions((current) => [...current, ...selected.slice(0, available).map(() => "")]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const uploading = loading && progress.length > 0;
  const overallProgress = progress.length
    ? progress.reduce((total, value) => total + value, 0) / progress.length
    : 0;
  const attachedVehicleId = attachmentType === "vehicle"
    ? vehicleId
    : attachmentType === "listing"
      ? listings.find((listing) => listing.id === listingId)?.vehicle_id ?? ""
      : "";

  return (
    <form action={handleSubmit} className="space-y-5">
      {eventPhotoContext ? <input type="hidden" name="event_id" value={eventPhotoContext.id} /> : null}
      <fieldset disabled={draftLocked} className="contents">
      {eventPhotoContext ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">{uiText("ui.event_photo_thread_6b19ac1816")}</p>
          <p className="mt-1 font-heading font-bold">{eventPhotoContext.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{uiText("ui.photos_only_your_caption_and_images_go_throu_1398f72130")}</p>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="group_id">{uiText("ui.post_destination_868c78293c")}</Label>
        <select
          id="group_id"
          name="group_id"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          disabled={Boolean(eventPhotoContext)}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        >
          <option value="">{uiText("ui.my_feed_1ae18f0448")}</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        {eventPhotoContext ? <input type="hidden" name="group_id" value={eventPhotoContext.groupId ?? ""} /> : null}
        <p className="text-xs text-muted-foreground">
          {groups.length ? uiText("ui.only_groups_you_have_joined_appear_here_0d76904233") : uiText("ui.join_a_community_group_to_post_there_020e56ba88")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="audience">{uiText("ui.audience_545c023576")}</Label>
        <select
          id="audience"
          name="audience"
          value={groupId ? "public" : audience}
          onChange={(event) => setAudience(event.target.value as "public" | "friends")}
          disabled={Boolean(groupId)}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        >
          <option value="friends">{uiText("ui.friends_bd104d1b98")}</option>
          {canPostPublic ? <option value="public">{uiText("ui.public_inside_perfectppi_59260e8311")}</option> : null}
        </select>
        {groupId ? <input type="hidden" name="audience" value="public" /> : null}
        <p className="text-xs text-muted-foreground">
          {groupId
            ? uiText("ui.public_group_posts_are_visible_to_eligible_s_d815a467d3")
            : canPostPublic ? uiText("ui.public_posts_are_visible_only_to_signed_in_p_53632f2cc6") : uiText("ui.your_private_profile_can_publish_to_friends__dd48f84cd4")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="post_type">{uiText("ui.post_type_e5c31e2bea")}</Label>
        <select
          id="post_type"
          name="post_type"
          value={postType}
          onChange={(event) => setPostType(event.target.value as PostType)}
          disabled={Boolean(eventPhotoContext)}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        >
          {POST_TYPES.map((type) => <option key={type} value={type}>{POST_TYPE_LABELS[type].label}</option>)}
        </select>
        {eventPhotoContext ? <input type="hidden" name="post_type" value="general" /> : null}
        <p className="text-xs text-muted-foreground">
          {postType === "question"
            ? uiText("ui.responses_can_be_marked_as_the_accepted_answ_19ce9448da")
            : postType === "general"
              ? uiText("ui.pick_a_type_to_add_structured_details_member_5503b88e5c")
              : POST_TYPE_LABELS[postType].prompt}
        </p>
      </div>

      <div className="space-y-2">
          <Label htmlFor="content">{eventPhotoContext ? uiText("ui.caption_87d296ec94") : postType === "question" ? uiText("ui.question_289aff12b0") : uiText("ui.post_a5554622c6")} *</Label>
        <Textarea
          id="content"
          name="content"
          rows={7}
          maxLength={1200}
          required
          placeholder={eventPhotoContext ? uiText("ui.what_should_other_attendees_know_about_these_efc5982adf") : postType === "question"
            ? uiText("ui.describe_the_symptoms_when_they_happen_and_w_d3ff6eee3a")
            : POST_TYPE_LABELS[postType].prompt}
        />
      </div>

      {postType !== "general" && postType !== "question" ? (
        <div className="space-y-2 rounded-xl border p-4">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">{POST_TYPE_LABELS[postType].label}{uiText("ui.details_06a7c52288")}</Label>
          <PostTypeFields
            postType={postType}
            fields={typeFields}
            onChange={setTypeFields}
            inspections={inspections}
            vehicleId={attachedVehicleId}
          />
        </div>
      ) : null}

      {mediaAllowed ? <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label htmlFor="post-media">{uiText("ui.photos_5e3147ab51")}{eventPhotoContext ? " *" : ""}</Label>
            <p className="text-xs text-muted-foreground">{uiText("ui.add_8d89e4a829")}{eventPhotoContext ? uiText("ui.1_to_11499cdb53") : uiText("ui.up_to_33bb38ae0f")}{uiText("ui.10_photos_their_order_becomes_the_carousel_o_63d10c7740")}</p>
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
            {videoAllowed ? uiText("ui.add_media_a078fb55c6") : uiText("ui.add_photos_aa07436c2c")}
          </Button>
          {uploading ? (
            <span className="text-xs font-medium text-muted-foreground">{uiText("ui.uploading_media_38364a4e54")}{Math.round(overallProgress * 100)}%
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
                description={mediaDescriptions[index] ?? ""}
                onDescriptionChange={(description) => setMediaDescriptions((current) => current.map((value, itemIndex) => itemIndex === index ? description : value))}
                onRemove={() => {
                  setMedia((current) => current.filter((_, itemIndex) => itemIndex !== index));
                  setMediaDescriptions((current) => current.filter((_, itemIndex) => itemIndex !== index));
                }}
              />
            ))}
          </div>
        ) : null}
      </div> : (
        <p className="text-xs text-muted-foreground">{uiText("ui.photo_uploads_are_temporarily_unavailable_yo_c11d265e0b")}</p>
      )}

      <div className="space-y-2">
        <Label htmlFor="attachment_type">{uiText("ui.attach_context_67d0385e08")}</Label>
        <select
          id="attachment_type"
          value={attachmentType}
          onChange={(event) => setAttachmentType(event.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="none">{uiText("ui.no_attachment_e37fad9915")}</option>
          <option value="vehicle">{uiText("ui.public_vehicle_profile_9295b13817")}</option>
          <option value="listing">{uiText("ui.active_marketplace_listing_c5e2b1aab4")}</option>
        </select>
      </div>

      {attachmentType === "vehicle" && (
        <div className="space-y-2">
          <Label htmlFor="vehicle_id">{uiText("ui.public_vehicle_b47f8cbc2a")}</Label>
          <select
            id="vehicle_id"
            name="vehicle_id"
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">{uiText("ui.choose_a_public_vehicle_92655a2258")}</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicleLabel(vehicle)}{vehicle.vin ? uiText("ui.text_913ac5c53d", { arg0: String(vehicle.vin) }) : ""}
              </option>
            ))}
          </select>
          {vehicles.length === 0 && (
            <p className="text-xs text-muted-foreground">{uiText("ui.make_a_vehicle_public_first_if_you_want_to_a_71740d0a5d")}</p>
          )}
        </div>
      )}

      {attachmentType === "listing" && (
        <div className="space-y-2">
          <Label htmlFor="listing_id">{uiText("ui.active_listing_b387f0944b")}</Label>
          <select
            id="listing_id"
            name="listing_id"
            value={listingId}
            onChange={(event) => setListingId(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">{uiText("ui.choose_an_active_listing_ac65368695")}</option>
            {listings.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.title} · {vehicleLabel(listing.vehicle)} · {formatCurrency(listing.asking_price_cents)}
              </option>
            ))}
          </select>
          {listings.length === 0 && (
            <p className="text-xs text-muted-foreground">{uiText("ui.create_an_active_marketplace_listing_first_i_f3152c8340")}</p>
          )}
        </div>
      )}
      </fieldset>

      {draftLocked && error ? (
        <p className="text-xs text-muted-foreground">{uiText("ui.your_private_post_draft_is_saved_retry_publi_a62abe57ea")}</p>
      ) : null}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>{loading ? uiText("ui.publishing_5f51143bee") : uiText("ui.publish_post_d3c183d5db")}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>{uiText("ui.cancel_19766ed6cc")}</Button>
      </div>
    </form>
  );
}

function MediaPreview({
  file,
  index,
  progress,
  description,
  onDescriptionChange,
  onRemove,
}: {
  file: File;
  index: number;
  progress: number | null;
  description: string;
  onDescriptionChange: (description: string) => void;
  onRemove: () => void;
}) {
  const uiText = useTranslator();
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="space-y-2 rounded-xl border bg-muted p-2">
      <div className="relative aspect-square overflow-hidden rounded-lg">
      {/* The object URL only exists after the effect runs — an empty `src`
          would otherwise make the browser re-request the current page. */}
      {url ? (
        file.type.startsWith("video/") ? (
          <video src={url} className="h-full w-full object-cover" muted playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={description} className="h-full w-full object-cover" />
        )
      ) : null}
      <span className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-bold text-white">
        {file.type.startsWith("video/") ? <Video className="h-3 w-3" /> : index + 1}
      </span>
      {progress === null ? (
        <Button type="button" size="icon" variant="destructive" className="absolute right-2 top-2 h-8 w-8 rounded-full" onClick={onRemove} aria-label={uiText("ui.remove_media_d672ceb021", { arg0: String(index + 1) })}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/40">
          <div
            className="h-full bg-primary transition-[width] duration-150"
            style={{ width: `${Math.round(progress * 100)}%` }}
            role="progressbar"
            aria-label={uiText("ui.upload_progress_for_media_b88b1a7ada", { arg0: String(index + 1) })}
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}
      </div>
      {file.type.startsWith("image/") ? (
        <div>
          <label htmlFor={`media-description-${index}`} className="sr-only">{uiText("ui.description_for_photo_000771bdbc")}{index + 1}</label>
          <input
            id={`media-description-${index}`}
            type="text"
            value={description}
            maxLength={300}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder={uiText("ui.describe_photo_optional_760e4ae1c4")}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
      ) : null}
    </div>
  );
}
