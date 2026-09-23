"use client";

import { useState, useEffect, useMemo } from "react";
import { uploadFailureMessage } from "@/lib/uploads/prepare-image";
import { UPLOAD_HINT, UploadError, uploadPhoto, type UploadStage } from "@/lib/uploads/upload-photo";
import { PhotoUploadSlot, type PendingUpload } from "@/components/shared/photo-upload-slot";
import { useRouter } from "next/navigation";
import { InspectionStepCard } from "@/components/shared/inspection-step-card";
import { AnswerInput } from "@/components/shared/answer-input";
import { StructuredAnswerInput } from "@/components/shared/structured-answer-input";
import { ProgressTracker } from "@/components/shared/progress-tracker";
import { CameraCapture } from "@/components/shared/camera-capture";
import { VinScanButton } from "@/components/shared/vin-scan-button";
import { answerIssue, answerNeedsPhoto, observationFromValue, useInspectionWorkflow } from "@/features/ppi/hooks";
import { deletePpiMedia, startInspection } from "@/features/ppi/actions";
import { DeletePhotoButton } from "@/components/shared/delete-photo-button";
import {
  SECTION_LABELS,
  VEHICLE_BASICS_VIN_PROMPT,
} from "@/features/ppi/constants";
import { CERTIFICATION_TEXT, CERTIFICATION_TEXT_VERSION } from "@/features/ppi/certification";
import { BODY_ZONES } from "@/features/ppi/inspection-catalog";
import { CAPTURE_CORNER_ORDER, isStructuredAnswerType, parseStructuredKey } from "@/features/ppi/inspection-schema";
import { buildInspectionFacts } from "@/features/ppi/inspection-facts";
import { evaluateInspection } from "@/features/ppi/inspection-rules";
import type { SectionType, AnswerType } from "@/types/enums";
import type { PpiAnswerItem, PpiSectionItem } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertCircle, AlertTriangle, Camera, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { numberInputConstraints } from "@/features/ppi/answer-validation";

import { useTranslator } from "@/lib/i18n/client";

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
  const uiText = useTranslator();
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("workflow");
  const [started, setStarted] = useState(false);
  const [cameraPhotoPrompt, setCameraPhotoPrompt] = useState<string | undefined>();
  const [cameraAnswerId, setCameraAnswerId] = useState<string | undefined>();
  const [cameraSectionId, setCameraSectionId] = useState<string | undefined>();
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [certified, setCertified] = useState(false);
  const [preparingReview, setPreparingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
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
        setMediaError(await uploadFailureMessage(response, uiText("ui.could_not_remove_the_retained_photo_8724fa1ea5")));
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
        throw new UploadError(await uploadFailureMessage(attachRes, uiText("ui.photo_uploaded_but_could_not_be_attached_to__a00beab0ee")), "processing", attachRes.status, attachRes.status >= 500);
      }
      const { data } = await attachRes.json();
      workflow.addMedia(pending.sectionId, data);
      patchPending(pending.id, { stage: "done", percent: 100 });
      window.setTimeout(() => removePending(pending.id), 1_200);
    } catch (error) {
      const stage: UploadStage = "failed";
      patchPending(pending.id, {
        stage,
        error: error instanceof Error ? error.message : uiText("ui.photo_upload_failed_please_try_again_e17c5befb6"),
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
      setMediaError(result.error ?? uiText("ui.could_not_delete_that_photo_db0ec674c9"));
      return;
    }
    workflow.removeMedia(sectionId, mediaId);
  }

  async function openReview() {
    setPreparingReview(true);
    setReviewError(null);
    setCertified(false);
    const ready = await workflow.prepareReview();
    setPreparingReview(false);
    if (!ready) {
      setReviewError(uiText("ui.could_not_save_and_reload_the_inspection_che_2c63c9ae73"));
    }
    setViewMode("review");
  }

  // Start the inspection on mount
  useEffect(() => {
    if (!started && !workflow.loading) {
      setStarted(true);
      startInspection(requestId, submissionId).catch(() => {});
    }
  }, [started, workflow.loading, requestId, submissionId]);

  // Findings the report will flag, recomputed from the current answers with
  // the same deterministic rules the report uses.
  const flagged = useMemo(() => {
    if (workflow.catalogVersion < 2 || viewMode !== "review") return [];
    try {
      const facts = buildInspectionFacts({
        scope: workflow.inspectionScope,
        catalogVersion: workflow.catalogVersion,
        performerMode: workflow.performerMode,
        inspectorName: null,
        submission: { id: submissionId, version: 1, submitted_at: null },
        vehicle: { year: null, make: null, model: null, trim: null, vin: null, mileage: null, mileage_unit: "mi", body_class: null },
        certification: null,
        sections: workflow.state.sections.map((section) => ({
          section_type: section.section_type,
          notes: section.notes,
          answers: section.answers.map((answer) => ({
            id: answer.id,
            prompt: answer.prompt,
            question_key: answer.question_key,
            answer_type: answer.answer_type,
            answer_value: isStructuredAnswerType(answer.answer_type) ? null : workflow.state.answers.get(answer.id) ?? null,
            observation: isStructuredAnswerType(answer.answer_type) ? observationFromValue(workflow.state.answers.get(answer.id)) : null,
            is_required: answer.is_required,
          })),
          media: section.media,
        })),
      });
      return evaluateInspection(facts, { inspectionDate: new Date() }).findings
        .filter((finding) => finding.action === "urgent" || finding.action === "service_recommended");
    } catch {
      return [];
    }
  }, [workflow.catalogVersion, workflow.performerMode, workflow.state.sections, workflow.state.answers, workflow.inspectionScope, submissionId, viewMode]);

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
        <p className="text-lg font-semibold">{workflow.loadError ?? uiText("ui.no_inspection_data_found_8d8e7c4167")}</p>
        <Button onClick={() => router.push(returnPath)}>{uiText("ui.go_back_b8d99df106")}</Button>
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

  const pendingOrFailed = pendingUploads.filter((upload) => upload.stage !== "done");

  // ---- Submit review screen ----
  if (viewMode === "review") {
    const issues = workflow.reviewIssues;
    const canSubmit = certified && issues.length === 0 && pendingOrFailed.length === 0 && !workflow.submitting && !preparingReview;
    const sectionLabel = (sectionType: string) => SECTION_LABELS[sectionType as SectionType] ?? sectionType;
    return (
      <div className="flex min-h-screen flex-col">
        <div className="border-b px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => setViewMode("workflow")}
            className="text-muted-foreground hover:text-foreground transition-colors text-sm"
          >{uiText("ui.back_to_inspection_1a3f61c79a")}</button>
          <h1 className="font-heading text-lg font-bold flex-1 text-center">{uiText("ui.review_submit_e877c5633a")}</h1>
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

          {reviewError ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive">{reviewError}</div>
          ) : null}

          {workflow.submitError && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-destructive">{workflow.submitError}</p>
                {workflow.missingAnswerIds.size > 0 && (
                  <p className="text-xs text-destructive/80 mt-1">
                    {workflow.missingAnswerIds.size}{uiText("ui.required_question_s_still_need_answers_9d6c22d4d6")}</p>
                )}
              </div>
            </div>
          )}

          {pendingOrFailed.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {pendingOrFailed.length}{uiText("ui.photo_upload_s_are_still_in_progress_or_fail_11f6a2ce21")}</div>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{uiText("ui.still_needed_b60de3ca37")}</h2>
            {issues.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl border bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />{uiText("ui.every_required_check_has_an_answer_and_its_p_71c68ecca7")}</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {issues.map((issue) => (
                  <li key={`${issue.answerId}-${issue.kind}`}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                      onClick={() => {
                        workflow.jumpToAnswer(issue.answerId);
                        setViewMode("workflow");
                      }}
                    >
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" />
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{issue.prompt}</span>
                        <span className="block text-xs text-muted-foreground">
                          {sectionLabel(issue.sectionType)} · {issue.message}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {flagged.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{uiText("ui.the_report_will_flag_0afdb6a703")}</h2>
              <ul className="space-y-2">
                {flagged.map((finding) => (
                  <li
                    key={finding.finding_id}
                    className={cn(
                      "rounded-xl border-l-4 bg-muted/40 px-4 py-3 text-sm",
                      finding.action === "urgent" ? "border-red-600" : "border-orange-500",
                    )}
                  >
                    <span className="block font-semibold">{finding.title}</span>
                    <span className="block text-muted-foreground">{finding.next_step}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{uiText("ui.if_anything_here_is_wrong_go_back_and_correc_93e25ea1aa")}</p>
            </section>
          ) : null}

          <label className="flex items-start gap-3 rounded-xl border p-4">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 flex-shrink-0"
              checked={certified}
              onChange={(event) => setCertified(event.target.checked)}
            />
            <span className="text-sm leading-relaxed">{CERTIFICATION_TEXT}</span>
          </label>

          <Button
            onClick={async () => {
              const requestId = await workflow.submitInspection({
                accepted: certified,
                textVersion: CERTIFICATION_TEXT_VERSION,
              });
              if (requestId) {
                setViewMode("submitted");
                router.replace(returnPath);
                router.refresh();
              } else {
                setCertified(false);
              }
            }}
            disabled={!canSubmit}
            className="w-full h-14 text-lg font-bold rounded-xl"
          >
            {workflow.submitting ? uiText("ui.submitting_49195f559e") : uiText("ui.certify_and_submit_inspection_4f12893916")}
          </Button>

          <Button
            variant="outline"
            onClick={() => setViewMode("workflow")}
            className="w-full"
          >{uiText("ui.continue_editing_56fd975f4c")}</Button>
        </div>
      </div>
    );
  }

  // ---- Success screen ----
  if (viewMode === "submitted") {
    return (
      <div className="flex min-h-screen items-center justify-center flex-col gap-6 px-6 text-center">
        <CheckCircle2 className="h-20 w-20 text-emerald-500" />
        <h2 className="text-2xl font-black font-heading">{uiText("ui.inspection_submitted_bb5891f014")}</h2>
        <p className="text-muted-foreground">{uiText("ui.your_inspection_has_been_submitted_successfu_23433635bf")}</p>
      </div>
    );
  }

  // ---- Main guided workflow ----
  const { currentSection, currentQuestion, currentGroup, currentStepAnswers } = workflow;
  if (!currentSection || !currentQuestion) return null;

  const sectionType = currentSection.section_type as SectionType;
  const sectionStateLabel =
    currentSection.completion_state === "completed"
      ? uiText("ui.completed_22a970d2e5")
      : currentSection.completion_state === "in_progress"
      ? uiText("ui.in_progress_b4cc4b07c3")
      : uiText("ui.not_started_6d54f9ecea");

  const bodyZone = currentGroup?.kind === "body_zone"
    ? BODY_ZONES.find((zone) => zone.id === currentGroup.zone) ?? null
    : null;
  const unansweredPanels = bodyZone
    ? currentStepAnswers.filter((answer) => answer.is_required && !workflow.state.answers.get(answer.id))
    : [];

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
        questionNumber={workflow.stepNumber}
        totalQuestions={workflow.totalSteps}
        prompt={currentGroup ? currentGroup.label : currentQuestion.prompt}
        isRequired={currentStepAnswers.some((answer) => answer.is_required)}
        saving={workflow.saving}
        canGoNext={workflow.canGoNext}
        isFinalQuestion={workflow.isLastStep}
        isDeferred={workflow.isCurrentDeferred}
        onBack={
          workflow.canGoBack ? () => workflow.prevQuestion() : undefined
        }
        onNext={() => {
          if (workflow.isLastStep) {
            void openReview();
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
        <div className="space-y-6">
          {currentGroup?.kind === "wheel" ? (
            <p className="text-sm text-muted-foreground">{uiText("ui.work_around_the_car_front_left_rear_left_rea_2fbff08ad7")}</p>
          ) : null}

          {bodyZone && unansweredPanels.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              // Wraps on phones instead of clipping the sentence.
              className="h-auto min-h-9 w-full py-2 whitespace-normal"
              onClick={() => {
                for (const answer of unansweredPanels) {
                  workflow.setObservation(answer.id, {
                    v: 1,
                    state: "observed",
                    value: { condition: "no_visible_damage" },
                    reason: null,
                    source: "inspector_entry",
                  });
                }
              }}
            >{uiText("ui.mark_the_f3d2cedb83")}{unansweredPanels.length}{uiText("ui.unanswered_panel_s_here_as_no_visible_damage_ccfc495793")}</Button>
          ) : null}

          {currentStepAnswers.map((answer) => (
            <AnswerBlock
              key={answer.id}
              answer={answer}
              section={currentSection}
              grouped={Boolean(currentGroup)}
              value={workflow.state.answers.get(answer.id) ?? ""}
              workflow={workflow}
              submissionId={submissionId}
              pendingUploads={pendingUploads.filter(
                (pending) => pending.sectionId === currentSection.id && pending.answerId === answer.id,
              )}
              onRetryUpload={(pending) => void runUpload(pending)}
              onDiscardUpload={(pending) => void discardPending(pending)}
              onCapture={() => {
                setCameraPhotoPrompt(answer.photo_prompt ?? undefined);
                setCameraAnswerId(answer.id);
                setCameraSectionId(currentSection.id);
                setViewMode("camera");
              }}
              onDeletePhoto={(mediaId) => deleteCapturedPhoto(currentSection.id, mediaId)}
            />
          ))}

          {preparingReview ? (
            <p className="text-center text-sm text-muted-foreground">{uiText("ui.saving_and_preparing_your_review_c94c5c9506")}</p>
          ) : null}

          <div className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{uiText("ui.section_notes_6a05c4aca2")}</p>
                <p className="text-xs text-muted-foreground">{uiText("ui.optional_notes_saved_with_the_current_sectio_c1af4806de")}</p>
              </div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {sectionStateLabel}
              </span>
            </div>

            <Textarea
              value={currentSection.notes ?? ""}
              onChange={(e) => workflow.setSectionNotes(currentSection.id, e.target.value)}
              rows={3}
              placeholder={uiText("ui.add_any_extra_observations_for_this_section_157356c799")}
              className="resize-none"
            />
          </div>

          <p className="text-center text-xs text-muted-foreground">{UPLOAD_HINT}</p>

          {mediaError && (
            <p className="text-sm font-medium text-destructive">{mediaError}</p>
          )}
        </div>
      </InspectionStepCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One answer row inside a step: input, its own photos, and its own status.
// ---------------------------------------------------------------------------

type Workflow = ReturnType<typeof useInspectionWorkflow>;

function previousCornerMarkings(section: PpiSectionItem, answer: PpiAnswerItem, workflow: Workflow) {
  const info = parseStructuredKey(answer.question_key ?? "");
  if (!info || info.family !== "tire_sidewall") return null;
  const index = CAPTURE_CORNER_ORDER.indexOf(info.corner);
  if (index <= 0) return null;
  const previousKey = `tires.${CAPTURE_CORNER_ORDER[index - 1]}.sidewall`;
  const previous = section.answers.find((candidate) => candidate.question_key === previousKey);
  const observation = previous ? observationFromValue(workflow.state.answers.get(previous.id)) : null;
  return observation?.state === "observed" ? (observation.value as Record<string, unknown>) : null;
}

function AnswerBlock({
  answer,
  section,
  grouped,
  value,
  workflow,
  submissionId,
  pendingUploads,
  onRetryUpload,
  onDiscardUpload,
  onCapture,
  onDeletePhoto,
}: {
  answer: PpiAnswerItem;
  section: PpiSectionItem;
  grouped: boolean;
  value: string;
  workflow: Workflow;
  submissionId: string;
  pendingUploads: PendingUpload[];
  onRetryUpload: (pending: PendingUpload) => void;
  onDiscardUpload: (pending: PendingUpload) => void;
  onCapture: () => void;
  onDeletePhoto: (mediaId: string) => Promise<void>;
}) {
  const uiText = useTranslator();
  const structured = isStructuredAnswerType(answer.answer_type);
  const media = section.media.filter((item) => item.ppi_answer_id === answer.id && item.media_type === "image");
  const needsPhoto = answerNeedsPhoto(answer, value);
  const hasPhoto = media.length > 0;
  const issue = value ? answerIssue(answer, value, workflow.performerMode) : null;
  const hasError = workflow.missingAnswerIds.has(answer.id) || Boolean(workflow.invalidAnswers.get(answer.id));
  const latestPhotoId = media.length ? media[media.length - 1].id : null;

  return (
    <div className={cn("space-y-3", grouped && "rounded-2xl border p-4")}>
      {grouped ? (
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug">{answer.prompt}</h3>
          <span className={cn("text-xs font-medium", answer.is_required ? "text-destructive" : "text-muted-foreground")}>
            {answer.is_required ? uiText("ui.required_4850b174b7") : uiText("ui.optional_59be71333c")}
          </span>
        </div>
      ) : null}

      {structured ? (
        <StructuredAnswerInput
          answer={answer}
          value={value}
          onChange={(observation) => workflow.setObservation(answer.id, observation)}
          performerMode={workflow.performerMode}
          hasError={hasError}
          serverError={workflow.invalidAnswers.get(answer.id) ?? null}
          submissionId={submissionId}
          latestPhotoId={latestPhotoId}
          previousMarkings={previousCornerMarkings(section, answer, workflow)}
        />
      ) : (
        <>
          <AnswerInput
            answerType={answer.answer_type as AnswerType}
            options={answer.options ? (answer.options as string[]) : null}
            value={value}
            onChange={(next) => workflow.setAnswer(answer.id, next)}
            required={answer.is_required}
            hasError={hasError}
            numberConstraints={numberInputConstraints(answer.prompt)}
          />
          {answer.prompt === VEHICLE_BASICS_VIN_PROMPT && (
            <VinScanButton
              label={value.trim() ? uiText("ui.rescan_vin_3da7075dc3") : uiText("ui.scan_vin_5074b45d61")}
              onDecoded={(vehicle) => workflow.setAnswer(answer.id, vehicle.vin)}
            />
          )}
        </>
      )}

      {/* Camera capture — offered on every row; whether it gates Continue
          depends on the row's rule and, for typed rows, on the answer. */}
      <button
        type="button"
        onClick={onCapture}
        className={cn(
          "w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed",
          "border-primary/40 text-primary hover:border-primary hover:bg-primary/5",
          "transition-all font-medium text-sm"
        )}
      >
        <Camera className="h-5 w-5" />
        {answer.photo_prompt ?? uiText("ui.capture_photo_d312fd29a2")}
      </button>

      {(media.length > 0 || pendingUploads.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {pendingUploads.map((pending) => (
            <PhotoUploadSlot
              key={pending.id}
              upload={pending}
              onRetry={() => onRetryUpload(pending)}
              onRemove={() => onDiscardUpload(pending)}
            />
          ))}
          {media.map((item, index) => (
            <div
              key={item.id}
              className="group relative aspect-[4/3] overflow-hidden rounded-xl border bg-secondary"
            >
              <DeletePhotoButton
                label={uiText("ui.delete_photo_3a4d9e70ca", { arg0: String(index + 1) })}
                confirmMessage="Delete this inspection photo? This cannot be undone."
                onDelete={() => onDeletePhoto(item.id)}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/ppi/media/${item.id}`}
                alt={uiText("ui.inspection_photo_d0a8a2557e", { arg0: String(index + 1) })}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-xs font-medium text-white">{uiText("ui.photo_234ad78cf0")}{index + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {needsPhoto && !hasPhoto && (
        <p className="text-sm font-medium text-amber-700">{uiText("ui.capture_at_least_one_photo_before_continuing_85e8dcfc47")}</p>
      )}

      {!structured && (hasError || issue) && (
        <p className="text-sm text-destructive font-medium">{issue ?? uiText("ui.this_answer_is_missing_or_invalid_19210b8158")}</p>
      )}
    </div>
  );
}
