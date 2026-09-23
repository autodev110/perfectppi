import { createHash } from "node:crypto";
import sharp from "sharp";

// ============================================================================
// Content facts for inspection uploads: what the stored bytes actually are,
// recorded by the server (never the client) and frozen into the certified
// media manifest. See supabase/migrations/20260923130000_ppi_media_content_hashes.sql.
// ============================================================================

export interface MediaContentFacts {
  sha256: string;
  byte_size: number;
  /** Sniffed from the bytes; the upload's declared type only as a fallback. */
  content_type: string;
  width: number | null;
  height: number | null;
  /** EXIF orientation 1–8 when present. */
  orientation: number | null;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);
const QUICKTIME_BRANDS = new Set(["qt  "]);

/**
 * The media type the leading bytes identify, or null when unrecognized. Covers
 * every upload type inspections accept (JPEG, PNG, WebP, HEIC/HEIF, MP4, MOV).
 */
export function sniffContentType(head: Uint8Array): string | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 8 && head[0] === 0x89 && ascii(head, 1, 3) === "PNG" && head[4] === 0x0d && head[5] === 0x0a) return "image/png";
  if (head.length >= 12 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP") return "image/webp";
  if (head.length >= 12 && ascii(head, 4, 4) === "ftyp") {
    const brand = ascii(head, 8, 4);
    if (HEIF_BRANDS.has(brand)) return brand.startsWith("hei") || brand.startsWith("hev") ? "image/heic" : "image/heif";
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (QUICKTIME_BRANDS.has(brand)) return "video/quicktime";
    return "video/mp4";
  }
  return null;
}

/**
 * Whether bytes read back for an export are the certified ones. Manifests
 * certified before content hashes existed have no hash and cannot be checked.
 */
export function matchesCertifiedContent(
  bytes: Uint8Array,
  entry: { sha256?: string | null; byte_size?: number | null },
): "match" | "mismatch" | "unverifiable" {
  if (!entry.sha256) return "unverifiable";
  if (entry.byte_size != null && bytes.byteLength !== entry.byte_size) return "mismatch";
  return sha256Hex(bytes) === entry.sha256 ? "match" : "mismatch";
}

/**
 * Stored pixel dimensions and EXIF orientation (1–8). Descriptive only: an
 * unreadable image still gets its hash and size recorded.
 */
export async function describeImage(bytes: Uint8Array): Promise<{ width: number | null; height: number | null; orientation: number | null }> {
  try {
    const metadata = await sharp(Buffer.from(bytes), { failOn: "none" }).metadata();
    const orientation = metadata.orientation;
    return {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
      orientation: orientation && orientation >= 1 && orientation <= 8 ? orientation : null,
    };
  } catch {
    return { width: null, height: null, orientation: null };
  }
}

/** Short printable form of a content hash for evidence captions. */
export function shortHash(sha256: string): string {
  return `${sha256.slice(0, 16)}…`;
}
