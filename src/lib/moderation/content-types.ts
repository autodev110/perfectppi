// Leaf module (no imports) so storage helpers and tests can use it without
// pulling in the moderation providers.
export function extensionForContentType(contentType: string) {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/heic": "heic", "image/heif": "heif", "video/mp4": "mp4", "video/quicktime": "mov",
  };
  return extensions[contentType] ?? "bin";
}
