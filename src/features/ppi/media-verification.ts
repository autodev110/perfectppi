import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { digestStoredObject, isStoredObjectConfigured } from "@/lib/storage/r2";
import { UPLOAD_LIMITS } from "@/config/constants";
import { describeImage, sniffContentType, type MediaContentFacts } from "./media-content";

// ============================================================================
// Records what each inspection upload's stored bytes are (hash, size, sniffed
// type, dimensions) so certification can freeze them into the media manifest.
//
// Runs after a photo is attached, and again at submit for anything still
// unverified. Only the service role can write these columns; a recorded hash
// is immutable (see 20260923130000_ppi_media_content_hashes.sql).
// ============================================================================

const VERIFY_CONCURRENCY = 3;

/** Reads the stored object and derives its content facts. */
export async function inspectStoredMedia(storageReference: string): Promise<MediaContentFacts> {
  if (!isStoredObjectConfigured(storageReference)) {
    throw new Error("Storage for this upload is not configured.");
  }
  const digest = await digestStoredObject(storageReference, {
    maxBytes: Math.max(UPLOAD_LIMITS.maxImageSize, UPLOAD_LIMITS.maxVideoSize),
    keepBytesUpTo: UPLOAD_LIMITS.maxImageSize,
  });
  const contentType = sniffContentType(digest.head) ?? digest.declaredContentType;

  // Dimensions are descriptive; the hash and size are what bind evidence.
  const image = digest.bytes && contentType.startsWith("image/")
    ? await describeImage(digest.bytes)
    : { width: null, height: null, orientation: null };

  return {
    sha256: digest.sha256,
    byte_size: digest.byteSize,
    content_type: contentType,
    ...image,
  };
}

/**
 * Records content facts for one attached upload if they are missing. With
 * `force`, reads the bytes again and proves they still match the stored facts.
 * Safe to call repeatedly and concurrently: the update only applies to a row
 * that still has no hash.
 */
export async function verifyMediaContent(mediaId: string, options: { force?: boolean } = {}): Promise<
  { ok: true; facts: MediaContentFacts } | { ok: false; error: string }
> {
  const admin = createAdminClient();
  const { data: media, error } = await admin
    .from("ppi_media")
    .select("id, url, content_sha256, byte_size, content_type, width, height, orientation")
    .eq("id", mediaId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!media) return { ok: false, error: "Upload not found" };
  if (media.content_sha256 && media.byte_size !== null && media.content_type && !options.force) {
    return {
      ok: true,
      facts: {
        sha256: media.content_sha256,
        byte_size: media.byte_size,
        content_type: media.content_type,
        width: media.width,
        height: media.height,
        orientation: media.orientation,
      },
    };
  }

  let facts: MediaContentFacts;
  try {
    facts = await inspectStoredMedia(media.url);
  } catch (inspectError) {
    return { ok: false, error: inspectError instanceof Error ? inspectError.message : String(inspectError) };
  }

  if (media.content_sha256 && media.byte_size !== null && media.content_type) {
    if (
      facts.sha256 !== media.content_sha256
      || facts.byte_size !== media.byte_size
      || facts.content_type !== media.content_type
    ) {
      return { ok: false, error: "Stored upload changed after verification" };
    }
    return { ok: true, facts };
  }

  const { data: updated, error: updateError } = await admin
    .from("ppi_media")
    .update({
      content_sha256: facts.sha256,
      byte_size: facts.byte_size,
      content_type: facts.content_type,
      width: facts.width,
      height: facts.height,
      orientation: facts.orientation,
      content_verified_at: new Date().toISOString(),
    })
    .eq("id", mediaId)
    .is("content_sha256", null)
    .select("content_sha256, byte_size, content_type, width, height, orientation")
    .maybeSingle();
  if (updateError) return { ok: false, error: updateError.message };
  if (updated?.content_sha256 && updated.byte_size && updated.content_type) {
    return { ok: true, facts };
  }

  // A concurrent verifier may have won the conditional update. Return the
  // stored facts, not this request's independently calculated values.
  const { data: stored, error: storedError } = await admin
    .from("ppi_media")
    .select("content_sha256, byte_size, content_type, width, height, orientation")
    .eq("id", mediaId)
    .single();
  if (storedError || !stored?.content_sha256 || !stored.byte_size || !stored.content_type) {
    return { ok: false, error: storedError?.message ?? "Upload verification did not finish" };
  }
  return {
    ok: true,
    facts: {
      sha256: stored.content_sha256,
      byte_size: stored.byte_size,
      content_type: stored.content_type,
      width: stored.width,
      height: stored.height,
      orientation: stored.orientation,
    },
  };
}

/** Reads every upload immediately before certification and verifies its bytes. */
export async function verifySubmissionMedia(submissionId: string): Promise<{ verified: number; failed: { id: string; error: string }[] }> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("ppi_media")
    .select("id, section:ppi_sections!inner(ppi_submission_id)")
    .eq("section.ppi_submission_id", submissionId);
  if (error) return { verified: 0, failed: [{ id: submissionId, error: error.message }] };

  const ids = (rows ?? []).map((row) => row.id);
  const failed: { id: string; error: string }[] = [];
  let verified = 0;
  for (let start = 0; start < ids.length; start += VERIFY_CONCURRENCY) {
    const batch = ids.slice(start, start + VERIFY_CONCURRENCY);
    const results = await Promise.all(batch.map((id) => verifyMediaContent(id, { force: true })));
    results.forEach((result, index) => {
      if (result.ok) verified += 1;
      else failed.push({ id: batch[index], error: result.error });
    });
  }
  return { verified, failed };
}
