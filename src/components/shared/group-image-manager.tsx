"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { uploadFile } from "@/features/uploads/client";
import { ImagePlus, Trash2 } from "lucide-react";

type Kind = "avatar" | "cover";

// Group avatar / cover (plan 13.5). Upload goes to quarantine first; the
// server runs the same safety gate as post photos before the image is
// applied, so a held or blocked image never shows anywhere.
export function GroupImageManager({
  groupId,
  slug,
  avatarUrl,
  coverUrl,
}: {
  groupId: string;
  slug: string;
  avatarUrl: string | null;
  coverUrl: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputs = { avatar: useRef<HTMLInputElement>(null), cover: useRef<HTMLInputElement>(null) };

  async function upload(kind: Kind, file: File | undefined) {
    if (!file || busy) return;
    setBusy(kind);
    setProgress(0);
    setError(null);
    try {
      const reference = await uploadFile(file, "community_group", groupId, setProgress);
      const response = await fetch(`/api/community/groups/${encodeURIComponent(slug)}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, url: reference, contentType: file.type }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "The image could not be saved.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The image could not be saved.");
    } finally {
      setBusy(null);
      if (inputs[kind].current) inputs[kind].current.value = "";
    }
  }

  async function remove(kind: Kind) {
    if (busy || !window.confirm(`Remove the group ${kind}?`)) return;
    setBusy(kind);
    setError(null);
    try {
      const response = await fetch(`/api/community/groups/${encodeURIComponent(slug)}/images?kind=${kind}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "The image could not be removed.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The image could not be removed.");
    } finally {
      setBusy(null);
    }
  }

  function slot(kind: Kind, url: string | null, label: string, hint: string, shape: string) {
    return (
      <div className="flex items-start gap-4">
        <div className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-surface-container ghost-border ${shape}`}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6 text-on-surface-variant/40" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-bold">{label}</p>
          <p className="text-xs text-on-surface-variant">{hint}</p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputs[kind]}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => upload(kind, event.target.files?.[0])}
            />
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => inputs[kind].current?.click()}>
              {busy === kind ? `Uploading ${Math.round(progress * 100)}%` : url ? "Replace" : "Upload"}
            </Button>
            {url ? (
              <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => remove(kind)}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {slot("avatar", avatarUrl, "Avatar", "Square, shown next to the group name and in the directory.", "h-20 w-20 rounded-2xl")}
      {slot("cover", coverUrl, "Cover", "Wide banner across the top of the group page. JPEG, PNG, or WebP.", "h-20 w-40 rounded-2xl")}
      <p className="text-xs text-on-surface-variant">Images pass the same safety check as post photos before they appear. Only the owner and admins can change them.</p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
