import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  copyPrivateObject,
  isPrivateStorageReference,
  privateStorageReference,
  uploadPrivateObject,
} from "./r2.ts";
import { extensionForContentType } from "../moderation/content-types.ts";

// Private-by-default Community media (plan 19.2 / 21.2).
//
// Approved objects live only in the private bucket under an immutable,
// content-hash-keyed path. Ordinary viewers never receive an object URL: they
// fetch /api/community/media/{id}/display, which re-checks the parent post's
// status and audience on every request before streaming the display variant.
// The original stays as restricted evidence behind the audited moderator
// endpoint.

export const COMMUNITY_MEDIA_DISPLAY_VARIANTS = ["display"] as const;
export type CommunityMediaVariant = (typeof COMMUNITY_MEDIA_DISPLAY_VARIANTS)[number];

export const DISPLAY_VARIANT = {
  maxEdge: 2048,
  format: "webp" as const,
  contentType: "image/webp",
  quality: 82,
} as const;

/** Relative delivery path handed to clients instead of an object URL. */
export function communityMediaDeliveryPath(mediaId: string, variant: CommunityMediaVariant = "display") {
  return `/api/community/media/${mediaId}/${variant}`;
}

export function isApprovedCommunityReference(value: string) {
  return value.startsWith("r2-private:///community_post/");
}

export function isLegacyPublicCommunityUrl(value: string) {
  return /^https:\/\//.test(value);
}

export function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Immutable private key: the content hash is part of the name, so an object
 * can never be silently replaced under a reference that evidence points at.
 */
export function buildApprovedCommunityKey(params: {
  ownerId: string;
  postId: string;
  mediaId: string;
  sha256: string;
  contentType: string;
  variant?: CommunityMediaVariant;
}) {
  const suffix = params.variant ? `-${params.variant}` : "";
  const extension = params.variant === "display"
    ? DISPLAY_VARIANT.format
    : extensionForContentType(params.contentType);
  return `community_post/${params.ownerId}/${params.postId}/${params.mediaId}-${params.sha256.slice(0, 16)}${suffix}.${extension}`;
}

/**
 * Decodes and re-encodes a still photo into the display variant. Sharp drops
 * EXIF/XMP/ICC by default (no `withMetadata()`), so location and device
 * metadata never reach the public variant; `rotate()` bakes in the EXIF
 * orientation first so the stripped image still displays upright. Any decode
 * failure is a hard failure: an image that cannot be safely re-encoded is not
 * published (plan 21.1 "metadata-safe derivative before publication").
 */
export async function renderDisplayVariant(bytes: Uint8Array): Promise<{
  bytes: Uint8Array;
  contentType: string;
  width: number;
  height: number;
}> {
  const output = await sharp(bytes, { failOn: "error", limitInputPixels: 80_000_000 })
    .rotate()
    .resize({
      width: DISPLAY_VARIANT.maxEdge,
      height: DISPLAY_VARIANT.maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: DISPLAY_VARIANT.quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  if (!output.info.width || !output.info.height) {
    throw new Error("Display variant could not be decoded");
  }
  return {
    bytes: new Uint8Array(output.data),
    contentType: DISPLAY_VARIANT.contentType,
    width: output.info.width,
    height: output.info.height,
  };
}

/** True when the variant carries no EXIF/XMP/ICC payload. Used by tests and the migration verifier. */
export async function displayVariantIsMetadataFree(bytes: Uint8Array): Promise<boolean> {
  const metadata = await sharp(bytes).metadata();
  return !metadata.exif && !metadata.xmp && !metadata.icc && !metadata.iptc;
}

/**
 * Moves an approved upload into its immutable private home and writes the
 * display variant. Returns the references to persist; the caller commits the
 * row and only then deletes the quarantine source.
 */
export async function publishCommunityMedia(params: {
  mediaId: string;
  postId: string;
  ownerId: string;
  mediaType: "image" | "video";
  contentType: string;
  /** Quarantine reference (private) or legacy public URL of the original. */
  sourceReference: string;
  /** Original bytes, already fetched for scanning/hashing. */
  bytes: Uint8Array;
  /** Images get a display variant unless the caller is only moving non-public evidence. */
  withDisplayVariant?: boolean;
}): Promise<{ storageReference: string; displayReference: string | null; sha256: string }> {
  const sha256 = sha256Hex(params.bytes);
  const originalKey = buildApprovedCommunityKey({
    ownerId: params.ownerId,
    postId: params.postId,
    mediaId: params.mediaId,
    sha256,
    contentType: params.contentType,
  });

  // Re-publishing an already-approved object (e.g. a moderator restoring
  // media the migration worker moved earlier) resolves to the same immutable
  // key; copying an object onto itself is rejected by S3-compatible stores.
  const originalReference = privateStorageReference(originalKey);
  const original = params.sourceReference === originalReference
    ? { storageReference: originalReference }
    : isPrivateStorageReference(params.sourceReference)
      ? await copyPrivateObject({ sourceReference: params.sourceReference, destinationKey: originalKey })
      : await uploadPrivateObject({ key: originalKey, body: params.bytes, contentType: params.contentType });

  let displayReference: string | null = null;
  if (params.mediaType === "image" && params.withDisplayVariant !== false) {
    const variant = await renderDisplayVariant(params.bytes);
    const displayKey = buildApprovedCommunityKey({
      ownerId: params.ownerId,
      postId: params.postId,
      mediaId: params.mediaId,
      sha256,
      contentType: params.contentType,
      variant: "display",
    });
    const uploaded = await uploadPrivateObject({
      key: displayKey,
      body: variant.bytes,
      contentType: variant.contentType,
    });
    displayReference = uploaded.storageReference;
  }

  return { storageReference: original.storageReference, displayReference, sha256 };
}

/** Both objects that make up an approved media item, for cleanup workers. */
export function approvedCommunityReferences(row: { url: string; display_reference: string | null }) {
  const references = [row.url];
  if (row.display_reference) references.push(row.display_reference);
  return references.filter((value) => isPrivateStorageReference(value) || isLegacyPublicCommunityUrl(value));
}

export { privateStorageReference };
