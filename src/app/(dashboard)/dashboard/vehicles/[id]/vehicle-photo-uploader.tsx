"use client";

import { ChangeEvent, useRef, useState } from "react";
import { UPLOAD_HINT, uploadPhoto, type UploadProgress } from "@/lib/uploads/upload-photo";
import { useRouter } from "next/navigation";
import { attachVehiclePhoto } from "@/features/vehicles/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Loader2, X } from "lucide-react";

type VehiclePhotoUploaderProps = {
  vehicleId: string;
};

export function VehiclePhotoUploader({ vehicleId }: VehiclePhotoUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setError(null);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null);
  }

  function clearSelection() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setError(null);
    // Reset the input too, so re-picking the same file still fires onChange.
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onUpload() {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      // Shared pipeline: device-side re-encode for photos, progress, server
      // fallback, specific failure reasons, diagnostics.
      const { publicUrl, file: prepared } = await uploadPhoto({
        file,
        entity: "vehicle_media",
        recordId: vehicleId,
        onProgress: setProgress,
      });
      setProgress({ stage: "processing", percent: 100 });
      const result = await attachVehiclePhoto({
        vehicleId,
        url: publicUrl,
        mediaType: prepared.type.startsWith("video/") ? "video" : "image",
        contentType: prepared.type,
      });

      if (result?.error) throw new Error(result.error);

      clearSelection();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vehicle photo upload failed");
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="vehicle-photo">Upload photos or videos</Label>
        <Input
          id="vehicle-photo"
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime"
          onChange={onPickFile}
          disabled={uploading}
        />
        <p className="text-xs text-muted-foreground">
          {UPLOAD_HINT} Videos up to 50 MB. Accepted media is reviewed, then added to this vehicle; the newest approved item becomes primary.
        </p>
      </div>

      {previewUrl && (
        <div className="relative overflow-hidden rounded-xl border bg-muted">
          {file?.type.startsWith("video/") ? (
            <video src={previewUrl} controls playsInline className="h-48 w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Selected vehicle upload preview" className="h-48 w-full object-cover" />
          )}
          <button
            type="button"
            aria-label="Remove selected photo"
            title="Remove selected photo"
            disabled={uploading}
            onClick={clearSelection}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white shadow-sm backdrop-blur-sm transition-all hover:bg-destructive hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error} {file ? <button type="button" onClick={onUpload} className="font-semibold underline">Retry</button> : null}
        </p>
      )}

      {uploading && progress ? (
        <div className="space-y-1" aria-live="polite">
          <p className="text-xs text-muted-foreground">
            {progress.stage === "preparing" ? "Preparing…" : progress.stage === "uploading" ? `Uploading ${progress.percent}%` : progress.stage === "processing" ? "Processing…" : "Uploaded"}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress.stage === "preparing" ? 5 : progress.percent}%` }} />
          </div>
        </div>
      ) : null}

      <Button type="button" onClick={onUpload} disabled={!file || uploading}>
        {uploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Camera className="mr-2 h-4 w-4" />
            Upload Media
          </>
        )}
      </Button>
    </div>
  );
}
