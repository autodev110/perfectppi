"use client";

import { useState, useEffect } from "react";
import { uploadFailureMessage } from "@/lib/uploads/prepare-image";
import { UPLOAD_HINT, UploadError, uploadPhoto, type UploadStage } from "@/lib/uploads/upload-photo";
import { PhotoUploadSlot, type PendingUpload } from "@/components/shared/photo-upload-slot";
import { useRouter } from "next/navigation";
import { InspectionStepCard } from "@/components/shared/inspection-step-card";
import { AnswerInput } from "@/components/shared/answer-input";
import { ProgressTracker } from "@/components/shared/progress-tracker";
import { CameraCapture } from "@/components/shared/camera-capture";
import { VinScanButton } from "@/components/shared/vin-scan-button";
import { useInspectionWorkflow } from "@/features/ppi/hooks";
import { deletePpiMedia, startInspection } from "@/features/ppi/actions";
import { DeletePhotoButton } from "@/components/shared/delete-photo-button";
import {
  SECTION_LABELS,
  VEHICLE_BASICS_VIN_PROMPT,
} from "@/features/ppi/constants";
import type { SectionType, AnswerType } from "@/types/enums";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertCircle, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { numberInputConstraints } from "@/features/ppi/answer-validation";

interface InspectionWorkflowViewProps {
  requestId: string;
  submissionId: string;
  returnPath: string; // e.g. "/dashboard/ppi/[id]" or "/tech/ppi/[id]"
}

type ViewMode = "workflow" | "camera" | "section-complete" | "review" | "submitted";

export function InspectionWorkflowView({
  requestId,
  submissionId,
  returnPath,
}: InspectionWorkflowViewProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("workflow");
  const [started, setStarted] = useState(false);
  const [cameraPhotoPrompt, setCameraPhotoPrompt] = useState<string | undefined>();
  const [cameraAnswerId, setCameraAnswerId] = useState<string | undefined>();
  const [cameraSectionId, setCameraSectionId] = useState<string | undefined>();
  const [mediaError, setMediaError] = useState<string | null>(null);
  // In-flight and failed photos stay visible in place with progress, retry,
  // and remove (Renditions doc: upload-state feedback, preserved context).
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);

  const workflow = useInspectionWorkflow(submissionId);

  function patchPending(id: string, patch: Partial<PendingUpload>) {
    setPendingUploads((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removePending(id: string) {
    setPendingUploads((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  async function discardPending(upload: PendingUpload) {
    if (upload.storageReference) {
      const response = await fetch(`/api/ppi/submissions/${submissionId}/media`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageReference: upload.storageReference }),
      });
      if (!response.ok) {
        setMediaError(await uploadFailureMessage(response, "Could not remove the retained photo."));
        return;
      }
    }
    removePending(upload.id);
  }

  async function runUpload(pending: PendingUpload) {
    patchPending(pending.id, { stage: "preparing", percent: 0, error: null, retryable: true });
    try {
      let publicUrl = pending.storageReference;
      if (!publicUrl) {
        const uploaded = await uploadPhoto({
          file: pending.file,
          entity: "ppi_media",
          recordId: submissionId,
          onProgress: ({ stage, percent }) => patchPending(pending.id, { stage, percent }),
        });
        publicUrl = uploaded.publicUrl;
        patchPending(pending.id, { storageReference: publicUrl });
      }
      patchPending(pending.id, { stage: "processing", percent: 100 });
      const attachRes = await fetch(`/api/ppi/submissions/${submissionId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ppi_section_id: pending.sectionId,
          ppi_answer_id: pending.answerId ?? null,
          url: publicUrl,
          media_type: "image",
          captured_at: new Date().toISOString(),
        }),
      });
      if (!attachRes.ok) {
        throw new UploadError(await uploadFailureMessage(attachRes, "Photo uploaded but could not be attached to the inspection."), "processing", attachRes.status, attachRes.status >= 500);
      }
      const { data } = await attachRes.json();
      workflow.addMedia(pending.sectionId, data);
      patchPending(pending.id, { stage: "done", percent: 100 });
      window.setTimeout(() => removePending(pending.id), 1_200);
    } catch (error) {
      const stage: UploadStage = "failed";
      patchPending(pending.id, {
        stage,
        error: error instanceof Error ? error.message : "Photo upload failed. Please try again.",
        retryable: error instanceof UploadError ? error.retryable : true,
      });
    }
  }

  function queueUpload(file: File, sectionId: string, answerId: string | undefined) {
    const pending: PendingUpload = {
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      sectionId,
      answerId,
      stage: "preparing",
      percent: 0,
      error: null,
      retryable: true,
    };
    setPendingUploads((current) => [...current, pending]);
    void runUpload(pending);
  }

  async function deleteCapturedPhoto(sectionId: string, mediaId: string) {
    setMediaError(null);
    const result = await deletePpiMedia(mediaId);
    if ("error" in result) {
      setMediaError(result.error ?? "Could not delete that photo.");
      return;
    }
    workflow.removeMedia(sectionId, mediaId);
  }

  // Start the inspection on mount
  useEffect(() => {
    if (!started && !workflow.loading) {
      setStarted(true);
      startInspection(requestId, submissionId).catch(() => {});
    }
  }, [started, workflow.loading, requestId, submissionId]);

  if (workflow.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (workflow.state.sections.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-4 px-6 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-semibold">No inspection data found</p>
        <Button onClick={() => router.push(returnPath)}>Go Back</Button>
      </div>
    );
  }

  // ---- Camera overlay ----
  if (viewMode === "camera") {
    return (
      <CameraCapture
        photoPrompt={cameraPhotoPrompt}
        onClose={() => setViewMode("workflow")}
        onCapture={(captured) => {
          setViewMode("workflow");
          if (!cameraSectionId) return;
          setMediaError(null);
          queueUpload(captured, cameraSectionId, cameraAnswerId);
        }}
      />
    );
  }

  // ---- Submit review screen ----
  if (viewMode === "review") {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="border-b px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => setViewMode("workflow")}
            className="text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            ← Back to Inspection
          </button>
          <h1 className="font-heading text-lg font-bold flex-1 text-center">
            Review & Submit
          </h1>
          <div className="w-24" />
        </div>

        <div className="flex-1 px-6 py-8 max-w-2xl mx-auto w-full space-y-6">
          <ProgressTracker
            sections={workflow.sectionProgress.map((s) => ({
              label: SECTION_LABELS[s.sectionType as SectionType] ?? s.label,
              completed: s.completed,
              active: false,
            }))}
          />

          {workflow.submitError && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-destructive">{workflow.submitError}</p>
                {workflow.missingAnswerIds.size > 0 && (
                  <p className="text-xs text-destructive/80 mt-1">
                    {workflow.missingAnswerIds.size} required question(s) still need answers.
                  </p>
                )}
              </div>
            </div>
          )}

          {!workflow.allComplete && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-sm text-amber-800 font-medium">
                Some sections are incomplete. You can still submit but required questions must be answered.
              </p>
            </div>
          )}

          <Button
            onClick={async () => {
              const requestId = await workflow.submitInspection();
              if (requestId) {
                setViewMode("submitted");
                router.replace(returnPath);
                router.refresh();
              }
            }}
            disabled={workflow.submitting}
            className="w-full h-14 text-lg font-bold rounded-xl"
          >
            {workflow.submitting ? "Submitting…" : "Submit Inspection"}
          </Button>

          <Button
            variant="outline"
            onClick={() => setViewMode("workflow")}
            className="w-full"
          >
            Continue Editing
          </Button>
        </div>
      </div>
    );
  }

  // ---- Success screen ----
  if (viewMode === "submitted") {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-6 px-6 text-center">
        <CheckCircle2 className="h-20 w-20 text-emerald-500" />
        <h2 className="text-2xl font-black font-heading">Inspection Submitted!</h2>
        <p className="text-muted-foreground">
          Your inspection has been submitted successfully. Redirecting…
        </p>
      </div>
    );
  }

  // ---- Main guided workflow ----
  const { currentSection, currentQuestion, currentValue } = workflow;
  if (!currentSection || !currentQuestion) return null;

  const sectionType = currentSection.section_type as SectionType;
  const sectionStateLabel =
    currentSection.completion_state === "completed"
      ? "Completed"
      : currentSection.completion_state === "in_progress"
      ? "In Progress"
      : "Not Started";
  // Photo rules come off the answer row, not a positional lookup into the
  // template array: two scopes can seed the same section with different rules,
  // and a stored answer order can outlive a template edit.
  const requiresPhoto = currentQuestion.requires_photo ?? false;
  const photoPrompt = currentQuestion.photo_prompt ?? undefined;
  const currentQuestionMedia = currentSection.media.filter(
    (media) =>
      media.ppi_answer_id === currentQuestion.id && media.media_type === "image",
  );
  const currentQuestionPending = pendingUploads.filter(
    (pending) => pending.sectionId === currentSection.id && pending.answerId === currentQuestion.id,
  );
  const hasRequiredPhoto = !requiresPhoto || currentQuestionMedia.length > 0;
  const canGoNext = workflow.canGoNext && hasRequiredPhoto;

  const hasError = workflow.missingAnswerIds.has(currentQuestion.id);

  return (
    <div className="relative">
      {/* Progress sidebar / top bar */}
      <div className="sticky top-0 z-20 bg-background border-b px-4 py-2">
        <ProgressTracker
          sections={workflow.sectionProgress.map((s) => ({
            label: SECTION_LABELS[s.sectionType as SectionType] ?? s.label,
            completed: s.completed,
            active: s.active,
          }))}
          className="max-w-2xl mx-auto"
        />
      </div>

      <InspectionStepCard
        sectionLabel={SECTION_LABELS[sectionType] ?? sectionType}
        questionNumber={workflow.currentQuestionIdx + 1}
        totalQuestions={currentSection.answers.length}
        prompt={currentQuestion.prompt}
        isRequired={currentQuestion.is_required}
        saving={workflow.saving}
        canGoNext={canGoNext}
        isFinalQuestion={workflow.isLastStep}
        isDeferred={workflow.isCurrentDeferred}
        onBack={
          workflow.canGoBack ? () => workflow.prevQuestion() : undefined
        }
        onNext={() => {
          if (workflow.isLastStep) {
            setViewMode("review");
          } else {
            workflow.nextQuestion();
          }
        }}
        onSkip={
          workflow.canSkipCurrent
            ? () => workflow.skipCurrentQuestion()
            : undefined
        }
      >
        <div className="space-y-4">
          <AnswerInput
            answerType={currentQuestion.answer_type as AnswerType}
            options={
              currentQuestion.options
                ? (currentQuestion.options as string[])
                : null
            }
            value={currentValue}
            onChange={(val) => workflow.setAnswer(currentQuestion.id, val)}
            required={currentQuestion.is_required}
            hasError={hasError}
            numberConstraints={numberInputConstraints(currentQuestion.prompt)}
          />

          {currentQuestion.prompt === VEHICLE_BASICS_VIN_PROMPT && (
            <VinScanButton
              label={currentValue.trim() ? "Rescan VIN" : "Scan VIN"}
              onDecoded={(vehicle) => workflow.setAnswer(currentQuestion.id, vehicle.vin)}
            />
          )}

          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Section Notes</p>
                <p className="text-xs text-muted-foreground">
                  Optional notes saved with the current section.
                </p>
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {sectionStateLabel}
              </span>
            </div>

            <Textarea
              value={currentSection.notes ?? ""}
              onChange={(e) => workflow.setSectionNotes(currentSection.id, e.target.value)}
              rows={3}
              placeholder="Add any extra observations for this section..."
              className="resize-none"
            />
          </div>

          {/* Camera capture button — offered on every question; `requiresPhoto`
              only decides whether Continue is gated. */}
          <button
              onClick={() => {
                setCameraPhotoPrompt(photoPrompt);
                setCameraAnswerId(currentQuestion.id);
                setCameraSectionId(currentSection.id);
                setViewMode("camera");
              }}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed",
                "border-primary/40 text-primary hover:border-primary hover:bg-primary/5",
                "transition-all font-medium text-sm"
              )}
            >
              <Camera className="h-5 w-5" />
              {photoPrompt ?? "Capture Photo"}
            </button>

          <p className="text-center text-xs text-muted-foreground">{UPLOAD_HINT}</p>

          {(currentQuestionMedia.length > 0 || currentQuestionPending.length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {currentQuestionPending.map((pending) => (
                <PhotoUploadSlot
                  key={pending.id}
                  upload={pending}
                  onRetry={() => void runUpload(pending)}
                  onRemove={() => void discardPending(pending)}
                />
              ))}
              {currentQuestionMedia.map((media, index) => (
                <div
                  key={media.id}
                  className="group relative aspect-[4/3] overflow-hidden rounded-xl border bg-secondary"
                >
                  <DeletePhotoButton
                    label={`Delete photo ${index + 1}`}
                    confirmMessage="Delete this inspection photo? This cannot be undone."
                    onDelete={() => deleteCapturedPhoto(currentSection.id, media.id)}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/ppi/media/${media.id}`}
                    alt={`Inspection photo ${index + 1}`}
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(e) => {
                      console.error("[inspection] image failed to load", {
                        mediaId: media.id,
                        rawUrl: media.url,
                        endpoint: `/api/ppi/media/${media.id}`,
                        currentSrc: e.currentTarget.currentSrc,
                      });
                    }}
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-xs font-medium text-white">
                    Photo {index + 1}
                  </div>
                </div>
              ))}
            </div>
          )}

          {requiresPhoto && !hasRequiredPhoto && (
            <p className="text-sm font-medium text-amber-700">
              Capture at least one photo before continuing.
            </p>
          )}

          {mediaError && (
            <p className="text-sm font-medium text-destructive">{mediaError}</p>
          )}

          {hasError && (
            <p className="text-sm text-destructive font-medium">
              This answer is missing or invalid.
            </p>
          )}
        </div>
      </InspectionStepCard>
    </div>
  );
}
