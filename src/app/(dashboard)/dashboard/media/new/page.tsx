"use client";

import { type ChangeEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMediaPackage } from "@/features/media/actions";
import { UPLOAD_LIMITS } from "@/config/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type PackageItem = {
  type: "image" | "video" | "file";
  url: string;
  name: string;
};

function inferTypeFromMime(mime: string): "image" | "video" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CreateMediaPackagePage() {
  const router = useRouter();
  const uploadRecordId = useMemo(() => crypto.randomUUID(), []);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const accept = useMemo(
    () =>
      [
        ...UPLOAD_LIMITS.allowedImageTypes,
        ...UPLOAD_LIMITS.allowedVideoTypes,
        ...UPLOAD_LIMITS.allowedFileTypes,
      ].join(","),
    [],
  );

  async function uploadViaServer(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entity", "media_package");
    fd.append("recordId", uploadRecordId);

    const directRes = await fetch("/api/upload/direct", {
      method: "POST",
      body: fd,
    });

    if (!directRes.ok) {
      const payload = await directRes.json().catch(() => null);
      throw new Error(payload?.error ?? `Upload failed for ${file.name}`);
    }

    const payload = (await directRes.json()) as { publicUrl?: string };
    if (!payload.publicUrl) throw new Error(`Upload failed for ${file.name}`);
    return payload.publicUrl;
  }

  async function uploadOne(file: File): Promise<PackageItem> {
    const presignRes = await fetch("/api/upload/presigned-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        entity: "media_package",
        recordId: uploadRecordId,
      }),
    });

    let publicUrl: string | null = null;

    if (presignRes.ok) {
      const payload = (await presignRes.json()) as {
        uploadUrl?: string;
        publicUrl?: string;
      };

      if (payload.uploadUrl && payload.publicUrl) {
        publicUrl = payload.publicUrl;
        try {
          const uploadRes = await fetch(payload.uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type || "application/octet-stream" },
          });
          if (!uploadRes.ok) {
            publicUrl = await uploadViaServer(file);
          }
        } catch {
          publicUrl = await uploadViaServer(file);
        }
      }
    }

    if (!publicUrl) {
      publicUrl = await uploadViaServer(file);
    }

    return {
      type: inferTypeFromMime(file.type),
      url: publicUrl,
      name: file.name,
    };
  }

  function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const next = Array.from(event.target.files ?? []);
    setFiles(next);
    setError(null);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    if (files.length === 0) {
      setError("Add at least one file");
      return;
    }

    startTransition(async () => {
      try {
        const items: PackageItem[] = [];
        for (let i = 0; i < files.length; i += 1) {
          setUploadingIndex(i);
          const item = await uploadOne(files[i]);
          items.push(item);
        }

        const result = await createMediaPackage({
          title: title.trim(),
          description: description.trim() || undefined,
          items,
        });

        if ("error" in result) {
          setError(result.error ?? "Failed to create media package");
          setUploadingIndex(null);
          return;
        }

        setUploadingIndex(null);
        router.push("/dashboard/media");
        router.refresh();
      } catch (e) {
        setUploadingIndex(null);
        setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">Create Media Package</h1>

      <Card>
        <CardHeader>
          <CardTitle>Package Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Example: 2021 Ford Escape - Buyer Package"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional package notes"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="files">Files</Label>
            <Input
              id="files"
              type="file"
              multiple
              accept={accept}
              onChange={onPickFiles}
            />
            <p className="text-xs text-on-surface-variant">
              Allowed: images, mp4/mov, pdf/doc/docx/txt
            </p>
          </div>

          {files.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-outline-variant/20 p-3">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-on-surface">{file.name}</p>
                    <p className="text-xs text-on-surface-variant">
                      {inferTypeFromMime(file.type)} • {formatBytes(file.size)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeFile(index)}
                    disabled={isPending}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          {uploadingIndex !== null ? (
            <p className="text-sm text-on-surface-variant">
              Uploading file {uploadingIndex + 1} of {files.length}...
            </p>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Uploading..." : "Create Package"}
            </Button>
            <Button variant="outline" onClick={() => router.back()} disabled={isPending}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
