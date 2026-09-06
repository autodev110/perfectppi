import type { InlineMediaPart } from "@/lib/ai/gemini";
import { getObjectFromStoredUrl, isStoredObjectConfigured } from "@/lib/storage/r2";

/**
 * Inspection photos were collected but never analysed — the report pipeline
 * only ever read typed answers. For a cosmetic inspection the photo *is* the
 * evidence, so this loads them as inline parts for the Stage 1 model call.
 *
 * Gemini does not fetch URLs, so bytes have to travel inline. Everything here
 * is best-effort: an unreadable object is skipped, never fatal, so a report
 * still generates from the typed answers alone.
 */

/** A malformed env var must not silently disable photos via NaN. */
function limitFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Token cost is per image, so cap the count as well as the bytes. */
const MAX_PHOTOS = limitFromEnv(process.env.INSPECTION_PHOTO_LIMIT, 16);
/** base64 inflates by 4/3; 12MB of source stays under Gemini's request ceiling. */
const MAX_TOTAL_BYTES = limitFromEnv(
  process.env.INSPECTION_PHOTO_BYTE_LIMIT,
  12 * 1024 * 1024,
);
const MAX_SINGLE_BYTES = 10 * 1024 * 1024;
const FETCH_CONCURRENCY = 4;
/**
 * The output route caps at 300s and still has two model calls, two PDFs, and
 * four uploads to do. Slow storage must not eat that budget — stop fetching
 * and report the rest as skipped.
 */
const FETCH_BUDGET_MS = limitFromEnv(process.env.INSPECTION_PHOTO_BUDGET_MS, 45_000);
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export interface PhotoAnswer {
  id: string;
  prompt: string;
  answer_value: string | null;
  requires_photo: boolean;
}

export interface PhotoSection {
  section_type: string;
  answers: PhotoAnswer[];
  media: {
    id: string;
    ppi_answer_id: string | null;
    url: string;
    media_type: string;
  }[];
}

export interface LoadedInspectionPhotos {
  parts: InlineMediaPart[];
  /** One line per attached image, in the order the parts are sent. */
  manifest: { index: number; sectionType: string; prompt: string | null }[];
  skipped: number;
  unreadable: number;
}

interface Candidate {
  url: string;
  sectionType: string;
  prompt: string | null;
  tier: number;
}

export async function loadInspectionPhotos(
  sections: PhotoSection[],
): Promise<LoadedInspectionPhotos> {
  const candidates: Candidate[] = [];

  for (const section of sections) {
    const answersById = new Map(section.answers.map((a) => [a.id, a]));

    for (const media of section.media ?? []) {
      // Video is a different modality and a single file can exceed the whole
      // request budget on its own.
      if (media.media_type !== "image") continue;
      if (!isStoredObjectConfigured(media.url)) continue;

      const answer = media.ppi_answer_id ? answersById.get(media.ppi_answer_id) : undefined;
      // Ranked so that dropping the tail drops the least informative photos
      // first, and so a retry selects the same set.
      const tier = answer?.requires_photo
        ? 0
        : (answer?.answer_value ?? "").trim().length > 0
          ? 1
          : 2;

      candidates.push({
        url: media.url,
        sectionType: section.section_type,
        prompt: answer?.prompt ?? null,
        tier,
      });
    }
  }

  candidates.sort((a, b) => a.tier - b.tier);
  const selected = candidates.slice(0, MAX_PHOTOS);
  let skipped = candidates.length - selected.length;
  let unreadable = 0;

  const parts: InlineMediaPart[] = [];
  const manifest: LoadedInspectionPhotos["manifest"] = [];
  let totalBytes = 0;

  const deadline = Date.now() + FETCH_BUDGET_MS;

  for (let start = 0; start < selected.length; start += FETCH_CONCURRENCY) {
    if (Date.now() > deadline) {
      skipped += selected.length - start;
      break;
    }
    const chunk = selected.slice(start, start + FETCH_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((candidate) =>
        getObjectFromStoredUrl(candidate.url, { maxBytes: MAX_SINGLE_BYTES }),
      ),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected") {
        unreadable += 1;
        continue;
      }

      const { bytes, contentType } = result.value;
      const normalizedContentType = contentType?.split(";", 1)[0].trim().toLowerCase();
      if (!normalizedContentType || !SUPPORTED_IMAGE_TYPES.has(normalizedContentType)) {
        unreadable += 1;
        continue;
      }
      if (totalBytes + bytes.byteLength > MAX_TOTAL_BYTES) {
        skipped += 1;
        continue;
      }
      totalBytes += bytes.byteLength;

      parts.push({
        mimeType: normalizedContentType,
        data: Buffer.from(bytes).toString("base64"),
      });
      manifest.push({
        index: parts.length,
        sectionType: chunk[i].sectionType,
        prompt: chunk[i].prompt,
      });
    }
  }

  return { parts, manifest, skipped, unreadable };
}
