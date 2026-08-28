export const UPLOAD_LIMITS = {
  maxImageSize: 10 * 1024 * 1024, // 10MB
  maxVideoSize: 50 * 1024 * 1024, // 50MB
  maxFileSize: 25 * 1024 * 1024, // 25MB
  allowedImageTypes: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
  ],
  allowedVideoTypes: ["video/mp4", "video/quicktime"],
  allowedFileTypes: [
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
} as const;
