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

import { useTranslator } from "@/lib/i18n/client";

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
  const uiText = useTranslator();
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
      throw new Error(payload?.error ?? uiText("ui.upload_failed_for_325ad16a5a", { arg0: String(file.name) }));
    }

    const payload = (await directRes.json()) as { publicUrl?: string };
    if (!payload.publicUrl) throw new Error(uiText("ui.upload_failed_for_325ad16a5a", { arg0: String(file.name) }));
    return payload.publicUrl;
  }

  async function uploadOne(file: File): Promise<PackageItem> {
    const presignRes = await fetch("/api/upload/presigned-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        size: file.size,
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
      setError(uiText("ui.title_is_required_d5b06872b5"));
      return;
    }

    if (files.length === 0) {
      setError(uiText("ui.add_at_least_one_file_b988e0381f"));
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
          uploadRecordId,
          title: title.trim(),
          description: description.trim() || undefined,
          items,
        });

        if ("error" in result) {
          setError(result.error ?? uiText("ui.failed_to_create_media_package_46765f578d"));
          setUploadingIndex(null);
          return;
        }

        setUploadingIndex(null);
        router.push("/dashboard/media");
        router.refresh();
      } catch (e) {
        setUploadingIndex(null);
        setError(e instanceof Error ? e.message : uiText("ui.upload_failed_please_try_again_35765e54d9"));
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">{uiText("ui.create_media_package_0dabf9716b")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{uiText("ui.package_details_aa2bd98514")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">{uiText("ui.title_7e8cd2056d")}</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={uiText("ui.example_2021_ford_escape_buyer_package_539132a27c")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{uiText("ui.description_526e0087cc")}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={uiText("ui.optional_package_notes_9c94ba69bd")}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="files">{uiText("ui.files_abc7e98928")}</Label>
            <Input
              id="files"
              type="file"
              multiple
              accept={accept}
              onChange={onPickFiles}
            />
            <p className="text-xs text-on-surface-variant">{uiText("ui.allowed_images_mp4_mov_pdf_doc_docx_txt_1541572d8b")}</p>
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
                  >{uiText("ui.remove_c3812fc4ac")}</Button>
                </div>
              ))}
            </div>
          ) : null}

          {uploadingIndex !== null ? (
            <p className="text-sm text-on-surface-variant">{uiText("ui.uploading_file_7c1313d51d")}{uploadingIndex + 1}{uiText("ui.of_a4282e4b22")}{files.length}...
            </p>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? uiText("ui.uploading_72cb29c90c") : uiText("ui.create_package_0f4fd87bb3")}
            </Button>
            <Button variant="outline" onClick={() => router.back()} disabled={isPending}>{uiText("ui.cancel_19766ed6cc")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
