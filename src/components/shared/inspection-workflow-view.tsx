"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { InspectionStepCard } from "@/components/shared/inspection-step-card";
import { AnswerInput } from "@/components/shared/answer-input";
import { ProgressTracker } from "@/components/shared/progress-tracker";
import { CameraCapture } from "@/components/shared/camera-capture";
import { useInspectionWorkflow } from "@/features/ppi/hooks";
import { startInspection } from "@/features/ppi/actions";
import { SECTION_QUESTION_TEMPLATES, SECTION_LABELS } from "@/features/ppi/constants";
import type { SectionType, AnswerType } from "@/types/enums";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Camera } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const workflow = useInspectionWorkflow(submissionId);

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
        onCapture={async (file) => {
          setViewMode("workflow");
          if (!cameraSectionId) return;
          setUploadingMedia(true);
          setMediaError(null);

          try {
            // Get presigned URL
            const presignRes = await fetch("/api/upload/presigned-url", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filename: file.name,
                contentType: file.type,
                entity: "ppi_media",
                recordId: submissionId,
              }),
            });

            if (!presignRes.ok) {
              setMediaError("Could not prepare the photo upload.");
              return;
            }
            const { uploadUrl, publicUrl } = await presignRes.json();

            // Upload to R2
            const uploadRes = await fetch(uploadUrl, {
              method: "PUT",
              body: file,
              headers: { "Content-Type": file.type },
            });

            if (!uploadRes.ok) {
              setMediaError("Photo upload failed.");
              return;
            }

            // Attach media record
            const attachRes = await fetch(`/api/ppi/submissions/${submissionId}/media`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ppi_section_id: cameraSectionId,
                ppi_answer_id: cameraAnswerId ?? null,
                url: publicUrl,
                media_type: "image",
                captured_at: new Date().toISOString(),
              }),
            });

            if (!attachRes.ok) {
              setMediaError("Photo uploaded but could not be attached to the inspection.");
              return;
            }

            const { data } = await attachRes.json();
            workflow.addMedia(cameraSectionId, data);
          } catch {
            setMediaError("Photo upload failed. Please try again.");
          } finally {
            setUploadingMedia(false);
          }
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
                setTimeout(() => {
                  router.push(returnPath);
                }, 2000);
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
  const templates = SECTION_QUESTION_TEMPLATES[sectionType] ?? [];
  const template = templates[workflow.currentQuestionIdx];
  const requiresPhoto = template?.requiresPhoto ?? false;
  const currentQuestionMedia = currentSection.media.filter(
    (media) =>
      media.ppi_answer_id === currentQuestion.id ||
      (requiresPhoto &&
        media.ppi_answer_id === null &&
        media.ppi_section_id === currentSection.id)
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
        isLastQuestion={workflow.isLastQuestion}
        isLastSection={workflow.isLastSection}
        onBack={
          workflow.currentSectionIdx > 0 || workflow.currentQuestionIdx > 0
            ? () => workflow.prevQuestion()
            : undefined
        }
        onNext={() => {
          if (workflow.isLastQuestion && workflow.isLastSection) {
            setViewMode("review");
          } else {
            workflow.nextQuestion();
          }
        }}
        onSkip={
          !currentQuestion.is_required
            ? () => workflow.nextQuestion()
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
          />

          {/* Camera capture button */}
          {requiresPhoto && (
            <button
              onClick={() => {
                setCameraPhotoPrompt(template.photoPrompt);
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
              {template.photoPrompt ?? "Capture Photo"}
            </button>
          )}

          {uploadingMedia && (
            <p className="text-xs text-muted-foreground text-center">Uploading photo…</p>
          )}

          {currentQuestionMedia.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {currentQuestionMedia.map((media, index) => (
                <div
                  key={media.id}
                  className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-secondary"
                >
                  <div
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                    style={{ backgroundImage: `url("${media.url}")` }}
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
              This question is required.
            </p>
          )}
        </div>
      </InspectionStepCard>
    </div>
  );
}
