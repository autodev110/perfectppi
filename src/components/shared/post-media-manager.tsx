"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { uploadFile } from "@/features/uploads/client";
import type { Database } from "@/types/database";
import { ImagePlus, Trash2, Video } from "lucide-react";

type PostMedia = Database["public"]["Tables"]["community_post_media"]["Row"];

const MAX_MEDIA = 10;
const ACCEPTED =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime";

/**
 * Owner-facing counterpart to `PostMediaCarousel`: the public feed swipes
 * through the carousel, while the author manages the same items as a grid.
 */
export function PostMediaManager({
  postId,
  media,
}: {
  postId: string;
  media: PostMedia[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const available = Math.max(0, MAX_MEDIA - media.length);
  const busy = progress !== null || removingId !== null;

  async function addMedia(files: FileList | null) {
    if (inputRef.current) inputRef.current.value = "";
    if (!files) return;

    const selected = Array.from(files)
      .filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"))
      .slice(0, available);
    if (selected.length === 0) return;

    setError(null);
    const fractions = selected.map(() => 0);
    setProgress(0);

    try {
      const uploaded = await Promise.all(
        selected.map(async (file, index) => ({
          url: await uploadFile(file, "community_post", postId, (fraction) => {
            fractions[index] = fraction;
            setProgress(fractions.reduce((total, value) => total + value, 0) / fractions.length);
          }),
          mediaType: file.type.startsWith("video/") ? "video" : "image",
          contentType: file.type,
          sortOrder: index,
        })),
      );

      const response = await fetch(`/api/community/posts/${postId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: uploaded }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Could not attach media");
      }
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload media");
    } finally {
      setProgress(null);
    }
  }

  async function removeMedia(mediaId: string) {
    setError(null);
    setRemovingId(mediaId);
    try {
      const response = await fetch(`/api/community/posts/${postId}/media/${mediaId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Could not remove media");
      }
      router.refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove media");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="max-w-xl space-y-2">
      {media.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {media.map((item, index) => (
            <div
              key={item.id}
              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
            >
              {item.moderation_status !== "active" ? (
                <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
                  <ImagePlus className="h-5 w-5" />
                  <span className="font-semibold capitalize">{item.moderation_status.replaceAll("_", " ")}</span>
                  <span>This media is not public.</span>
                </div>
              ) : item.media_type === "video" ? (
                <>
                  <video src={item.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                  <Video className="absolute bottom-1.5 left-1.5 h-3.5 w-3.5 text-white drop-shadow" />
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt={`Post media ${index + 1}`} className="h-full w-full object-cover" />
              )}
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="absolute right-1 top-1 h-7 w-7 rounded-full"
                onClick={() => removeMedia(item.id)}
                disabled={busy}
                aria-label={`Remove media ${index + 1}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        className="sr-only"
        onChange={(event) => addMedia(event.target.files)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={busy || available === 0}
        >
          <ImagePlus className="mr-2 h-3.5 w-3.5" />
          {media.length > 0 ? "Add more" : "Add photos or videos"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {progress === null
            ? `${media.length}/${MAX_MEDIA}`
            : `Uploading… ${Math.round(progress * 100)}%`}
        </span>
      </div>

      {progress === null ? null : (
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-150"
            style={{ width: `${Math.round(progress * 100)}%` }}
            role="progressbar"
            aria-label="Media upload progress"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}

      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
