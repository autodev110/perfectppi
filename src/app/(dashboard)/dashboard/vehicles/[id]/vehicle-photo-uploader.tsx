"use client";

import { ChangeEvent, useRef, useState } from "react";
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

  async function uploadViaServer(selectedFile: File) {
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("entity", "vehicle_media");
    formData.append("recordId", vehicleId);

    const response = await fetch("/api/upload/direct", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error ?? "Vehicle photo upload failed");
    }

    const payload = (await response.json()) as { publicUrl?: string };
    if (!payload.publicUrl) throw new Error("Vehicle photo upload failed");
    return payload.publicUrl;
  }

  async function uploadFile(selectedFile: File) {
    const presignResponse = await fetch("/api/upload/presigned-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: selectedFile.name,
        contentType: selectedFile.type,
        size: selectedFile.size,
        entity: "vehicle_media",
        recordId: vehicleId,
      }),
    });

    if (!presignResponse.ok) return uploadViaServer(selectedFile);

    const payload = (await presignResponse.json()) as {
      uploadUrl?: string;
      publicUrl?: string;
    };

    if (!payload.uploadUrl || !payload.publicUrl) return uploadViaServer(selectedFile);

    try {
      const uploadResponse = await fetch(payload.uploadUrl, {
        method: "PUT",
        body: selectedFile,
        headers: { "Content-Type": selectedFile.type || "application/octet-stream" },
      });

      if (!uploadResponse.ok) return uploadViaServer(selectedFile);
      return payload.publicUrl;
    } catch {
      return uploadViaServer(selectedFile);
    }
  }

  async function onUpload() {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const publicUrl = await uploadFile(file);
      const result = await attachVehiclePhoto({
        vehicleId,
        url: publicUrl,
        mediaType: file.type.startsWith("video/") ? "video" : "image",
        contentType: file.type,
      });

      if (result?.error) throw new Error(result.error);

      clearSelection();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vehicle photo upload failed");
    } finally {
      setUploading(false);
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
          Accepted media is reviewed, then added to this vehicle. The newest approved item becomes primary.
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

      {error && <p className="text-sm text-destructive">{error}</p>}

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
