// Client-side image preparation for uploads. Phone cameras produce 3–12 MB
// files (often HEIC); re-encoding to a bounded JPEG on the device keeps
// uploads fast on cellular, well under the serverless request limit used by
// the fallback upload route, and turns HEIC into something every viewer
// can render. Anything that cannot be decoded is uploaded unchanged.

export type PrepareImageOptions = {
  /** Longest edge after resizing. Inspection photos rarely need more than this. */
  maxDimension?: number;
  /** JPEG quality 0–1. */
  quality?: number;
  /** Files at or below this size that are already JPEG/PNG/WebP are left alone. */
  passThroughBytes?: number;
};

const RE_ENCODE_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence", ""]);

export function shouldPrepareImage(file: File, options: PrepareImageOptions = {}): boolean {
  const passThroughBytes = options.passThroughBytes ?? 1_500_000;
  if (!file.type.startsWith("image/") && file.type !== "") return false;
  if (RE_ENCODE_TYPES.has(file.type)) return true;
  return file.size > passThroughBytes;
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === "function") {
    try {
      // EXIF orientation is applied by the browser so the JPEG we produce is
      // upright without carrying orientation metadata.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to the <img> path (older Safari, unsupported options).
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    image.src = url;
  });
}

/**
 * Returns a resized JPEG `File` when the input benefits from it, otherwise
 * the original file. Never throws.
 */
export async function prepareImageForUpload(file: File, options: PrepareImageOptions = {}): Promise<File> {
  if (typeof document === "undefined" || !shouldPrepareImage(file, options)) return file;
  const maxDimension = options.maxDimension ?? 2048;
  const quality = options.quality ?? 0.85;
  try {
    const source = await decode(file);
    if (!source) return file;
    const width = "naturalWidth" in source ? source.naturalWidth : source.width;
    const height = "naturalHeight" in source ? source.naturalHeight : source.height;
    if (!width || !height) return file;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    if ("close" in source) source.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size === 0) return file;
    // Only swap when it actually helped (a small PNG can grow as JPEG).
    if (blob.size >= file.size && !RE_ENCODE_TYPES.has(file.type)) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || `photo-${Date.now()}`;
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

/** A human explanation for a failed upload response, JSON body or not. */
export async function uploadFailureMessage(response: Response, fallback = "Photo upload failed."): Promise<string> {
  const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
  if (payload?.error) return payload.error;
  if (response.status === 413) return "The photo is too large to upload over this connection. Try a smaller photo or a better connection.";
  if (response.status === 401) return "Your session expired. Sign in again and retry the photo.";
  if (response.status === 403) return "You do not have permission to add photos to this inspection.";
  if (response.status >= 500) return "The upload service is temporarily unavailable. Please try again in a moment.";
  return `${fallback} (HTTP ${response.status})`;
}
