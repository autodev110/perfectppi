"use client";

import { AlertTriangle, CheckCircle2, Loader2, RotateCw, X } from "lucide-react";
import type { UploadStage } from "@/lib/uploads/upload-photo";

export type PendingUpload = {
  id: string;
  file: File;
  previewUrl: string;
  sectionId: string;
  answerId: string | undefined;
  stage: UploadStage;
  percent: number;
  error: string | null;
  retryable: boolean;
};

// One photo's upload state, in the same tile the finished photo will occupy:
// Uploading N% → Processing → Uploaded, or Failed with the reason and Retry /
// Remove. The photo never disappears on failure (Renditions doc acceptance).
export function PhotoUploadSlot({ upload, onRetry, onRemove }: { upload: PendingUpload; onRetry: () => void; onRemove: () => void }) {
  const failed = upload.stage === "failed";
  const done = upload.stage === "done";
  const label = upload.stage === "preparing"
    ? "Preparing…"
    : upload.stage === "uploading"
      ? `Uploading ${upload.percent}%`
      : upload.stage === "processing"
        ? "Processing…"
        : done ? "Uploaded" : "Failed";
  return (
    <div
      className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-secondary"
      role="group"
      aria-label={failed ? `Photo upload failed: ${upload.error ?? ""}` : label}
      aria-live="polite"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={upload.previewUrl} alt="" className={`absolute inset-0 h-full w-full object-cover ${failed ? "opacity-40" : done ? "" : "opacity-70"}`} />
      {!failed ? (
        <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-6 text-xs font-medium text-white">
          <div className="flex items-center gap-1.5">
            {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{label}</span>
          </div>
          {upload.stage === "uploading" ? (
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/30" aria-hidden="true">
              <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${upload.percent}%` }} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col justify-end gap-2 bg-black/60 p-3 text-white">
          <p className="flex items-start gap-1.5 text-xs font-medium leading-snug">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span>{upload.error ?? "Photo upload failed."}</span>
          </p>
          <div className="flex gap-2">
            {upload.retryable ? (
              <button type="button" onClick={onRetry} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-white px-2 py-1.5 text-xs font-bold text-black">
                <RotateCw className="h-3 w-3" />Retry
              </button>
            ) : null}
            <button type="button" onClick={onRemove} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-white/50 px-2 py-1.5 text-xs font-bold text-white">
              <X className="h-3 w-3" />Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
