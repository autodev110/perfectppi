"use client";

import { useState, useEffect, useReducer, useCallback, useRef } from "react";
import { buildQuestionOrder } from "@/features/ppi/workflow-order";
import type {
  PpiRequestResponse,
  PpiSubmissionResponse,
  PpiSectionItem,
  PpiAnswerItem,
  PpiMediaItem,
} from "@/types/api";
import type { InspectionScope, CompletionState } from "@/types/enums";
import { inspectionAnswerValidationError } from "@/features/ppi/answer-validation";
import { stepGroupForKey } from "@/features/ppi/inspection-catalog";
import {
  isStructuredAnswerType,
  parseObservation,
  requirementError,
  structuredPhotoRequired,
  validateObservation,
  type ObservationDocument,
  type PerformerMode,
} from "@/features/ppi/inspection-schema";

// ============================================================================
// usePpiWizard
// Manages the multi-step intake wizard state
// ============================================================================

export type WizardStep =
  | "inspection_scope"
  | "vehicle"
  | "vehicle_info"
  | "whose_car"
  | "requester_role"
  | "performer_type"
  | "select_tech"
  | "confirm";

export interface WizardFormState {
  inspection_scope: InspectionScope;
  vehicle_id: string;
  vin: string;
  mileage: string;
  whose_car: "own" | "other" | null;
  requester_role: "buying" | "selling" | "documenting" | null;
  performer_type: "self" | "technician" | null;
  assigned_tech_profile_id: string | null;
  selected_tech_name: string | null;
}

const WIZARD_STEPS: WizardStep[] = [
  // Coarsest choice first: it decides which questions the inspection will ask.
  "inspection_scope",
  "vehicle",
  "vehicle_info",
  "whose_car",
  "requester_role",
  "performer_type",
  "select_tech",
  "confirm",
];

export function usePpiWizard() {
  const [step, setStep] = useState<WizardStep>("inspection_scope");
  const [form, setForm] = useState<WizardFormState>({
    inspection_scope: "complete",
    vehicle_id: "",
    vin: "",
    mileage: "",
    whose_car: null,
    requester_role: null,
    performer_type: null,
    assigned_tech_profile_id: null,
    selected_tech_name: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleSteps = WIZARD_STEPS.filter((s) => {
    if (s === "select_tech") return form.performer_type === "technician";
    return true;
  });

  const currentIndex = visibleSteps.indexOf(step);

  function next() {
    const nextIdx = currentIndex + 1;
    if (nextIdx < visibleSteps.length) {
      setStep(visibleSteps[nextIdx]);
    }
  }

  function back() {
    const prevIdx = currentIndex - 1;
    if (prevIdx >= 0) {
      setStep(visibleSteps[prevIdx]);
    }
  }

  const update = useCallback(<K extends keyof WizardFormState>(
    key: K,
    value: WizardFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  async function submit(): Promise<{ requestId: string; submissionId: string | null } | null> {
    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, string> = {
        inspection_scope: form.inspection_scope,
        vehicle_id: form.vehicle_id,
        vin: form.vin.trim(),
        mileage: form.mileage.trim(),
        whose_car: form.whose_car!,
        requester_role: form.requester_role!,
        performer_type: form.performer_type!,
      };
      if (form.assigned_tech_profile_id) {
        payload.assigned_tech_profile_id = form.assigned_tech_profile_id;
      }

      const res = await fetch("/api/ppi/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to create inspection");
        return null;
      }

      return json.data;
    } catch {
      setError("Network error. Please try again.");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  return {
    step,
    form,
    update,
    next,
    back,
    submit,
    submitting,
    error,
    currentIndex,
    totalSteps: visibleSteps.length,
    canGoBack: currentIndex > 0,
  };
}

// ============================================================================
// useInspectionWorkflow
// useReducer-based guided inspection state with debounced auto-save.
//
// Catalog-2 structured answers keep their typed observation serialized as JSON
// in the same answer map; wheel cards and body zones present several rows as
// one step. Navigation, deferral and completion all treat a group as a unit.
// ============================================================================

interface WorkflowState {
  sections: PpiSectionItem[];
  currentSectionIdx: number;
  currentQuestionIdx: number;
  deferredAnswerIds: string[];
  answers: Map<string, string>;
  dirtyAnswerIds: Set<string>;
  dirtySectionIds: Set<string>;
  saving: "idle" | "saving" | "saved" | "error";
  lastSaved: Date | null;
  submitting: boolean;
  submitError: string | null;
  missingAnswerIds: Set<string>;
  invalidAnswers: Map<string, string>;
  performerMode: PerformerMode;
  catalogVersion: number;
  revision: number;
  inspectionScope: InspectionScope;
}

type WorkflowAction =
  | { type: "INIT"; submission: PpiSubmissionResponse }
  | { type: "REFRESH"; submission: PpiSubmissionResponse }
  | { type: "SET_ANSWER"; answerId: string; value: string }
  | { type: "SET_SECTION_NOTES"; sectionId: string; notes: string }
  | { type: "ADD_MEDIA"; sectionId: string; media: PpiMediaItem }
  | { type: "REMOVE_MEDIA"; sectionId: string; mediaId: string }
  | { type: "NEXT_QUESTION" }
  | { type: "PREV_QUESTION" }
  | { type: "SKIP_CURRENT"; answerIds: string[] }
  | { type: "NEXT_SECTION" }
  | { type: "PREV_SECTION" }
  | { type: "JUMP_TO_SECTION"; sectionIdx: number }
  | { type: "JUMP_TO_ANSWER"; answerId: string }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS" }
  | { type: "SAVE_ERROR"; invalid?: { answerId: string; error: string }[] }
  | {
      type: "MARK_DIRTY_FLUSHED";
      flushedAnswerIds: string[];
      flushedSectionIds: string[];
    }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_ERROR"; message: string; missingIds: string[] }
  | { type: "CLEAR_MISSING"; answerId: string };

function sectionHasProgress(section: PpiSectionItem, answers: Map<string, string>) {
  return (
    section.answers.some((answer) => hasAnswerValue(answers.get(answer.id))) ||
    section.media.length > 0 ||
    hasAnswerValue(section.notes ?? undefined)
  );
}

function hasAnswerValue(value: string | undefined) {
  return value !== undefined && value.trim() !== "";
}

/** The typed observation held in the answer map, or null. */
export function observationFromValue(value: string | undefined): ObservationDocument | null {
  if (!value) return null;
  try {
    return parseObservation(JSON.parse(value));
  } catch {
    return null;
  }
}

function answerHasPhoto(section: PpiSectionItem, answerId: string) {
  return section.media.some((media) => media.ppi_answer_id === answerId && media.media_type === "image");
}

/** Whether this answer still needs a photo before it is complete. */
export function answerNeedsPhoto(answer: PpiAnswerItem, value: string | undefined): boolean {
  if (answer.requires_photo) return true;
  if (!isStructuredAnswerType(answer.answer_type)) return false;
  return structuredPhotoRequired(answer.question_key ?? "", observationFromValue(value));
}

/** Null when the answer is acceptable for submission, else the reason. */
export function answerIssue(
  answer: PpiAnswerItem,
  value: string | undefined,
  performerMode: PerformerMode,
): string | null {
  if (isStructuredAnswerType(answer.answer_type)) {
    const observation = observationFromValue(value);
    if (observation) {
      const validation = validateObservation(answer.question_key ?? "", observation);
      if (!validation.ok) return validation.error;
    }
    return requirementError(answer.question_key ?? "", observation, {
      required: answer.is_required,
      performerMode,
    });
  }
  return inspectionAnswerValidationError({
    prompt: answer.prompt,
    answerType: answer.answer_type,
    value,
    required: answer.is_required,
    options: answer.options,
  });
}

function answerLocations(sections: PpiSectionItem[]) {
  return sections.flatMap((section, sectionIdx) =>
    section.answers.map((answer, questionIdx) => ({
      answerId: answer.id,
      groupId: stepGroupForKey(answer.question_key)?.id ?? null,
      sectionIdx,
      questionIdx,
    }))
  );
}

function navigationAnswerIds(sections: PpiSectionItem[], deferredAnswerIds: string[]) {
  const allIds = answerLocations(sections).map((location) => location.answerId);
  return buildQuestionOrder(allIds, deferredAnswerIds);
}

/** Answer ids that share a step with this one, in navigation order. */
function stepMembers(sections: PpiSectionItem[], deferredAnswerIds: string[], answerId: string): string[] {
  const locations = answerLocations(sections);
  const location = locations.find((candidate) => candidate.answerId === answerId);
  if (!location?.groupId) return [answerId];
  const order = navigationAnswerIds(sections, deferredAnswerIds);
  const groupIds = new Set(
    locations
      .filter((candidate) => candidate.groupId === location.groupId && sections[candidate.sectionIdx] === sections[location.sectionIdx])
      .map((candidate) => candidate.answerId),
  );
  return order.filter((id) => groupIds.has(id));
}

/** First answer id of every step, in navigation order. */
function stepHeads(sections: PpiSectionItem[], deferredAnswerIds: string[]): string[] {
  const order = navigationAnswerIds(sections, deferredAnswerIds);
  const seen = new Set<string>();
  const heads: string[] = [];
  for (const id of order) {
    if (seen.has(id)) continue;
    const members = stepMembers(sections, deferredAnswerIds, id);
    members.forEach((member) => seen.add(member));
    heads.push(members[0] ?? id);
  }
  return heads;
}

function navigateToAnswer(state: WorkflowState, answerId: string): WorkflowState {
  const location = answerLocations(state.sections).find(
    (candidate) => candidate.answerId === answerId
  );
  if (!location) return state;
  return {
    ...state,
    currentSectionIdx: location.sectionIdx,
    currentQuestionIdx: location.questionIdx,
  };
}

function currentAnswerId(state: WorkflowState): string | null {
  return state.sections[state.currentSectionIdx]?.answers[state.currentQuestionIdx]?.id ?? null;
}

function isSectionComplete(section: PpiSectionItem, answers: Map<string, string>, performerMode: PerformerMode) {
  return section.answers.every((answer) => {
    const value = answers.get(answer.id);
    const answerSatisfied = answerIssue(answer, value, performerMode) === null;
    const photoSatisfied = !answerNeedsPhoto(answer, value) || answerHasPhoto(section, answer.id);
    return answerSatisfied && photoSatisfied;
  });
}

function deriveSectionState(
  section: PpiSectionItem,
  answers: Map<string, string>,
  performerMode: PerformerMode,
): CompletionState {
  if (isSectionComplete(section, answers, performerMode)) return "completed";
  if (sectionHasProgress(section, answers)) return "in_progress";
  return "not_started";
}

function answerMapFrom(sections: PpiSectionItem[]) {
  const answers = new Map<string, string>();
  for (const section of sections) {
    for (const answer of section.answers) {
      answers.set(
        answer.id,
        isStructuredAnswerType(answer.answer_type)
          ? answer.observation ? JSON.stringify(answer.observation) : ""
          : answer.answer_value ?? "",
      );
    }
  }
  return answers;
}

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case "INIT": {
      const performerMode: PerformerMode = action.submission.performer_mode === "self" ? "self" : "technician";
      const answers = answerMapFrom(action.submission.sections);
      const deferredAnswerIds = action.submission.sections
        .flatMap((section) => section.answers)
        .filter((answer) => Boolean(answer.deferred_at))
        .sort((a, b) =>
          (a.deferred_at ?? "").localeCompare(b.deferred_at ?? "")
        )
        .map((answer) => answer.id);

      const dirtySectionIds = new Set<string>();
      const sections = action.submission.sections.map((section) => {
        const completion_state = deriveSectionState(section, answers, performerMode);
        if (section.completion_state !== completion_state) {
          dirtySectionIds.add(section.id);
        }
        return { ...section, completion_state };
      });

      return {
        ...state,
        sections,
        answers,
        dirtyAnswerIds: new Set(),
        dirtySectionIds,
        saving: "idle",
        lastSaved: null,
        submitting: false,
        submitError: null,
        missingAnswerIds: new Set(),
        invalidAnswers: new Map(),
        currentSectionIdx: 0,
        currentQuestionIdx: 0,
        deferredAnswerIds,
        performerMode,
        catalogVersion: action.submission.catalog_version ?? 1,
        revision: action.submission.revision ?? 0,
        inspectionScope: action.submission.inspection_scope ?? "complete",
      };
    }

    case "REFRESH": {
      // Server state after a flush: authoritative answers, photos and the
      // revision the inspector is about to certify. Position is preserved.
      const answers = answerMapFrom(action.submission.sections);
      for (const dirtyId of state.dirtyAnswerIds) {
        const local = state.answers.get(dirtyId);
        if (local !== undefined) answers.set(dirtyId, local);
      }
      const sections = action.submission.sections.map((section) => ({
        ...section,
        completion_state: deriveSectionState(section, answers, state.performerMode),
      }));
      return {
        ...state,
        sections,
        answers,
        revision: action.submission.revision ?? state.revision,
      };
    }

    case "SET_ANSWER": {
      const newAnswers = new Map(state.answers);
      newAnswers.set(action.answerId, action.value);
      const newDirty = new Set(state.dirtyAnswerIds);
      newDirty.add(action.answerId);
      const newMissing = new Set(state.missingAnswerIds);
      newMissing.delete(action.answerId);
      const invalidAnswers = new Map(state.invalidAnswers);
      invalidAnswers.delete(action.answerId);
      const dirtySectionIds = new Set(state.dirtySectionIds);
      const sections = state.sections.map((section) => {
        if (!section.answers.some((answer) => answer.id === action.answerId)) {
          return section;
        }
        dirtySectionIds.add(section.id);
        return {
          ...section,
          completion_state: deriveSectionState(section, newAnswers, state.performerMode),
        };
      });
      return {
        ...state,
        sections,
        answers: newAnswers,
        dirtyAnswerIds: newDirty,
        dirtySectionIds,
        missingAnswerIds: newMissing,
        invalidAnswers,
        saving: "idle",
        deferredAnswerIds:
          action.value.trim() === ""
            ? state.deferredAnswerIds
            : state.deferredAnswerIds.filter((id) => id !== action.answerId),
      };
    }

    case "SET_SECTION_NOTES": {
      const dirtySectionIds = new Set(state.dirtySectionIds);
      dirtySectionIds.add(action.sectionId);
      const sections = state.sections.map((section) => {
        if (section.id !== action.sectionId) return section;
        const nextSection = {
          ...section,
          notes: action.notes.trim() === "" ? null : action.notes,
        };
        return {
          ...nextSection,
          completion_state: deriveSectionState(nextSection, state.answers, state.performerMode),
        };
      });
      return {
        ...state,
        sections,
        dirtySectionIds,
        saving: "idle",
      };
    }

    case "ADD_MEDIA":
      {
        const dirtySectionIds = new Set(state.dirtySectionIds);
        dirtySectionIds.add(action.sectionId);
        return {
          ...state,
          dirtySectionIds,
          saving: "idle",
          sections: state.sections.map((section) => {
            if (section.id !== action.sectionId) return section;
            const nextSection = { ...section, media: [...section.media, action.media] };
            return {
              ...nextSection,
              completion_state: deriveSectionState(nextSection, state.answers, state.performerMode),
            };
          }),
        };
      }

    case "REMOVE_MEDIA":
      return {
        ...state,
        sections: state.sections.map((section) => {
          if (section.id !== action.sectionId) return section;
          const nextSection = {
            ...section,
            media: section.media.filter((media) => media.id !== action.mediaId),
          };
          return {
            ...nextSection,
            completion_state: deriveSectionState(nextSection, state.answers, state.performerMode),
          };
        }),
      };

    case "MARK_DIRTY_FLUSHED": {
      const remainingDirtyAnswers = new Set(state.dirtyAnswerIds);
      action.flushedAnswerIds.forEach((answerId) => remainingDirtyAnswers.delete(answerId));
      const remainingDirtySections = new Set(state.dirtySectionIds);
      action.flushedSectionIds.forEach((sectionId) => remainingDirtySections.delete(sectionId));
      return {
        ...state,
        dirtyAnswerIds: remainingDirtyAnswers,
        dirtySectionIds: remainingDirtySections,
        saving: "saved",
        lastSaved: new Date(),
      };
    }

    case "NEXT_QUESTION": {
      const currentId = currentAnswerId(state);
      if (!currentId) return state;
      const heads = stepHeads(state.sections, state.deferredAnswerIds);
      const members = stepMembers(state.sections, state.deferredAnswerIds, currentId);
      const index = heads.indexOf(members[0] ?? currentId);
      const nextId = heads[index + 1];
      return nextId ? navigateToAnswer(state, nextId) : state;
    }

    case "PREV_QUESTION": {
      const currentId = currentAnswerId(state);
      if (!currentId) return state;
      const heads = stepHeads(state.sections, state.deferredAnswerIds);
      const members = stepMembers(state.sections, state.deferredAnswerIds, currentId);
      const index = heads.indexOf(members[0] ?? currentId);
      const previousId = index > 0 ? heads[index - 1] : undefined;
      return previousId ? navigateToAnswer(state, previousId) : state;
    }

    case "SKIP_CURRENT": {
      const currentId = currentAnswerId(state);
      if (!currentId) return state;
      const headsBefore = stepHeads(state.sections, state.deferredAnswerIds);
      const members = stepMembers(state.sections, state.deferredAnswerIds, currentId);
      const index = headsBefore.indexOf(members[0] ?? currentId);
      const nextId = headsBefore[index + 1];
      if (!nextId) return state;
      const skipped = new Set(action.answerIds);
      return navigateToAnswer(
        {
          ...state,
          deferredAnswerIds: [
            ...state.deferredAnswerIds.filter((id) => !skipped.has(id)),
            ...action.answerIds,
          ],
        },
        nextId
      );
    }

    case "NEXT_SECTION": {
      const nextIdx = state.currentSectionIdx + 1;
      if (nextIdx < state.sections.length) {
        return { ...state, currentSectionIdx: nextIdx, currentQuestionIdx: 0 };
      }
      return state;
    }

    case "PREV_SECTION": {
      const prevIdx = state.currentSectionIdx - 1;
      if (prevIdx >= 0) {
        return { ...state, currentSectionIdx: prevIdx, currentQuestionIdx: 0 };
      }
      return state;
    }

    case "JUMP_TO_SECTION":
      return {
        ...state,
        currentSectionIdx: action.sectionIdx,
        currentQuestionIdx: 0,
      };

    case "JUMP_TO_ANSWER": {
      const members = stepMembers(state.sections, state.deferredAnswerIds, action.answerId);
      return navigateToAnswer(state, members[0] ?? action.answerId);
    }

    case "SAVE_START":
      return { ...state, saving: "saving" };

    case "SAVE_SUCCESS":
      return { ...state, saving: "saved", lastSaved: new Date() };

    case "SAVE_ERROR": {
      const invalidAnswers = new Map(state.invalidAnswers);
      for (const entry of action.invalid ?? []) invalidAnswers.set(entry.answerId, entry.error);
      return { ...state, saving: "error", invalidAnswers };
    }

    case "SUBMIT_START":
      return { ...state, submitting: true, submitError: null };

    case "SUBMIT_ERROR":
      return {
        ...state,
        submitting: false,
        submitError: action.message,
        missingAnswerIds: new Set(action.missingIds),
      };

    case "CLEAR_MISSING": {
      const newMissing = new Set(state.missingAnswerIds);
      newMissing.delete(action.answerId);
      return { ...state, missingAnswerIds: newMissing };
    }

    default:
      return state;
  }
}

const initialWorkflowState: WorkflowState = {
  sections: [],
  currentSectionIdx: 0,
  currentQuestionIdx: 0,
  deferredAnswerIds: [],
  answers: new Map(),
  dirtyAnswerIds: new Set(),
  dirtySectionIds: new Set(),
  saving: "idle",
  lastSaved: null,
  submitting: false,
  submitError: null,
  missingAnswerIds: new Set(),
  invalidAnswers: new Map(),
  performerMode: "technician",
  catalogVersion: 1,
  revision: 0,
  inspectionScope: "complete",
};

export interface ReviewIssue {
  answerId: string;
  sectionType: string;
  prompt: string;
  kind: "missing" | "invalid" | "photo";
  message: string;
}

export function useInspectionWorkflow(submissionId: string) {
  const [state, dispatch] = useReducer(workflowReducer, initialWorkflowState);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferInFlight = useRef(false);

  // Load submission on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/ppi/submissions/${submissionId}`);
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setLoadError(json.error ?? null);
          return;
        }
        const { data }: { data: PpiSubmissionResponse } = await res.json();
        dispatch({ type: "INIT", submission: data });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [submissionId]);

  // Debounced auto-save
  const flushDirty = useCallback(
    async (
      dirtyAnswerIds: Set<string>,
      dirtySectionIds: Set<string>,
      answers: Map<string, string>,
      sections: PpiSectionItem[]
    ) => {
      if (dirtyAnswerIds.size === 0 && dirtySectionIds.size === 0) return true;

      dispatch({ type: "SAVE_START" });
      const flushedAnswerIds = Array.from(dirtyAnswerIds);
      const flushedSectionIds = Array.from(dirtySectionIds);
      const answerById = new Map(sections.flatMap((section) => section.answers).map((answer) => [answer.id, answer]));

      try {
        if (dirtyAnswerIds.size > 0) {
          const payload = Array.from(dirtyAnswerIds).map((answerId) => {
            const value = answers.get(answerId) ?? "";
            const answer = answerById.get(answerId);
            if (answer && isStructuredAnswerType(answer.answer_type)) {
              return { answerId, observation: value ? observationFromValue(value) : null };
            }
            return { answerId, value };
          });

          const res = await fetch(`/api/ppi/submissions/${submissionId}/answers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answers: payload }),
          });

          if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            dispatch({ type: "SAVE_ERROR", invalid: json.invalid });
            return false;
          }
        }

        if (dirtySectionIds.size > 0) {
          const dirtySections = sections.filter((section) => dirtySectionIds.has(section.id));
          const results = await Promise.all(
            dirtySections.map((section) =>
              fetch(`/api/ppi/submissions/${submissionId}/sections`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  section_id: section.id,
                  completion_state: section.completion_state,
                  notes: section.notes,
                }),
              })
            )
          );

          if (results.some((result) => !result.ok)) {
            dispatch({ type: "SAVE_ERROR" });
            return false;
          }
        }

        dispatch({
          type: "MARK_DIRTY_FLUSHED",
          flushedAnswerIds,
          flushedSectionIds,
        });
        return true;
      } catch {
        dispatch({ type: "SAVE_ERROR" });
        return false;
      }
    },
    [submissionId]
  );

  // Trigger debounced save whenever dirty set changes
  useEffect(() => {
    if (state.dirtyAnswerIds.size === 0 && state.dirtySectionIds.size === 0) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void flushDirty(
        state.dirtyAnswerIds,
        state.dirtySectionIds,
        state.answers,
        state.sections
      );
    }, 1500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [state.dirtyAnswerIds, state.dirtySectionIds, state.answers, state.sections, flushDirty]);

  // Immediate flush (called before navigating section)
  const immediateFlush = useCallback(async () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    return flushDirty(
      state.dirtyAnswerIds,
      state.dirtySectionIds,
      state.answers,
      state.sections
    );
  }, [flushDirty, state.dirtyAnswerIds, state.dirtySectionIds, state.answers, state.sections]);

  function setAnswer(answerId: string, value: string) {
    dispatch({ type: "SET_ANSWER", answerId, value });
  }

  function setObservation(answerId: string, observation: ObservationDocument | null) {
    dispatch({ type: "SET_ANSWER", answerId, value: observation ? JSON.stringify(observation) : "" });
  }

  function setSectionNotes(sectionId: string, notes: string) {
    dispatch({ type: "SET_SECTION_NOTES", sectionId, notes });
  }

  function nextQuestion() {
    void immediateFlush();
    dispatch({ type: "NEXT_QUESTION" });
  }

  function prevQuestion() {
    void immediateFlush();
    dispatch({ type: "PREV_QUESTION" });
  }

  // Derived values
  const currentSection = state.sections[state.currentSectionIdx] ?? null;
  const currentQuestion: PpiAnswerItem | null =
    currentSection?.answers[state.currentQuestionIdx] ?? null;
  const currentValue = currentQuestion
    ? (state.answers.get(currentQuestion.id) ?? "")
    : "";
  const currentGroup = currentQuestion ? stepGroupForKey(currentQuestion.question_key) : null;
  const currentStepAnswerIds = currentQuestion
    ? stepMembers(state.sections, state.deferredAnswerIds, currentQuestion.id)
    : [];
  const currentStepAnswers = currentStepAnswerIds
    .map((id) => currentSection?.answers.find((answer) => answer.id === id))
    .filter((answer): answer is PpiAnswerItem => Boolean(answer));

  async function skipCurrentQuestion() {
    if (!currentQuestion || deferInFlight.current) return;
    const skippable = currentStepAnswers.filter(
      (answer) => !state.deferredAnswerIds.includes(answer.id),
    );
    if (skippable.length === 0) return;
    deferInFlight.current = true;
    try {
      const flushSucceeded = await immediateFlush();
      if (!flushSucceeded) return;
      const response = await fetch(
        `/api/ppi/submissions/${submissionId}/answers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            answers: skippable.map((answer) =>
              isStructuredAnswerType(answer.answer_type)
                ? { answerId: answer.id, deferred: true }
                : { answerId: answer.id, value: state.answers.get(answer.id) ?? "", deferred: true },
            ),
          }),
        }
      );
      if (response.ok) {
        dispatch({ type: "SKIP_CURRENT", answerIds: skippable.map((answer) => answer.id) });
      } else {
        dispatch({ type: "SAVE_ERROR" });
      }
    } finally {
      deferInFlight.current = false;
    }
  }

  function nextSection() {
    void immediateFlush();
    dispatch({ type: "NEXT_SECTION" });
  }

  function prevSection() {
    void immediateFlush();
    dispatch({ type: "PREV_SECTION" });
  }

  function jumpToSection(idx: number) {
    void immediateFlush();
    dispatch({ type: "JUMP_TO_SECTION", sectionIdx: idx });
  }

  function jumpToAnswer(answerId: string) {
    void immediateFlush();
    dispatch({ type: "JUMP_TO_ANSWER", answerId });
  }

  function addMedia(sectionId: string, media: PpiMediaItem) {
    dispatch({ type: "ADD_MEDIA", sectionId, media });
  }

  function removeMedia(sectionId: string, mediaId: string) {
    dispatch({ type: "REMOVE_MEDIA", sectionId, mediaId });
  }

  /**
   * Flushes every pending save, then reloads the server copy. What the review
   * screen shows — and the revision it certifies — is exactly what is stored.
   */
  async function prepareReview(): Promise<boolean> {
    const flushSucceeded = await immediateFlush();
    if (!flushSucceeded) return false;
    try {
      const res = await fetch(`/api/ppi/submissions/${submissionId}`, { cache: "no-store" });
      if (!res.ok) return false;
      const { data }: { data: PpiSubmissionResponse } = await res.json();
      dispatch({ type: "REFRESH", submission: data });
      return true;
    } catch {
      return false;
    }
  }

  async function submitInspection(certification: { accepted: boolean; textVersion: string }) {
    const flushSucceeded = await immediateFlush();
    if (!flushSucceeded) {
      dispatch({
        type: "SUBMIT_ERROR",
        message: "Could not save your latest inspection changes. Please try again.",
        missingIds: [],
      });
      return null;
    }

    dispatch({ type: "SUBMIT_START" });

    try {
      const res = await fetch(`/api/ppi/submissions/${submissionId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certification: {
            accepted: certification.accepted,
            text_version: certification.textVersion,
            expected_revision: state.revision,
            locale: typeof navigator !== "undefined" ? navigator.language : "en-US",
          },
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.code === "stale_revision") await prepareReview();
        dispatch({
          type: "SUBMIT_ERROR",
          message: json.error ?? "Failed to submit",
          missingIds: json.missingAnswerIds ?? [],
        });
        return null;
      }

      return json.requestId as string;
    } catch {
      dispatch({
        type: "SUBMIT_ERROR",
        message: "Network error. Please try again.",
        missingIds: [],
      });
      return null;
    }
  }

  const navigationHeads = stepHeads(state.sections, state.deferredAnswerIds);
  const currentHead = currentStepAnswerIds[0] ?? currentQuestion?.id ?? null;
  const currentNavigationIndex = currentHead ? navigationHeads.indexOf(currentHead) : -1;
  const isLastStep =
    currentNavigationIndex >= 0 && currentNavigationIndex === navigationHeads.length - 1;
  const canGoBack = currentNavigationIndex > 0;
  const isCurrentDeferred = currentStepAnswers.some((answer) => state.deferredAnswerIds.includes(answer.id));
  const currentStepHasInput = currentStepAnswers.some((answer) => (state.answers.get(answer.id) ?? "").trim() !== "");
  const canSkipCurrent =
    currentNavigationIndex >= 0 &&
    currentNavigationIndex < navigationHeads.length - 1 &&
    (currentGroup ? !currentStepAnswers.every((answer) => answerIssue(answer, state.answers.get(answer.id), state.performerMode) === null) : !currentStepHasInput) &&
    !isCurrentDeferred;

  const sectionProgress = state.sections.map((s) => {
    const total = s.answers.length;
    const answered = s.answers.filter(
      (a) => (state.answers.get(a.id) ?? "") !== ""
    ).length;
    return {
      sectionId: s.id,
      sectionType: s.section_type,
      label: s.section_type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      answered,
      total,
      completed: s.completion_state === "completed",
      active: state.sections.indexOf(s) === state.currentSectionIdx,
    };
  });

  const overallProgress = Math.round(
    (sectionProgress.filter((s) => s.completed).length / Math.max(1, state.sections.length)) * 100
  );

  const allComplete = sectionProgress.every((s) => s.completed);

  // A step can continue when every member is acceptable and has its photos.
  const canGoNext = currentSection
    ? currentStepAnswers.every((answer) => {
        const value = state.answers.get(answer.id);
        return answerIssue(answer, value, state.performerMode) === null
          && (!answerNeedsPhoto(answer, value) || answerHasPhoto(currentSection, answer.id));
      })
    : false;

  const reviewIssues: ReviewIssue[] = state.sections.flatMap((section) =>
    section.answers.flatMap((answer): ReviewIssue[] => {
      const value = state.answers.get(answer.id);
      const issue = answerIssue(answer, value, state.performerMode);
      if (issue) {
        return [{
          answerId: answer.id,
          sectionType: section.section_type,
          prompt: answer.prompt,
          kind: hasAnswerValue(value) ? "invalid" as const : "missing" as const,
          message: issue,
        }];
      }
      if (answerNeedsPhoto(answer, value) && !answerHasPhoto(section, answer.id)) {
        return [{
          answerId: answer.id,
          sectionType: section.section_type,
          prompt: answer.prompt,
          kind: "photo" as const,
          message: "Add a photo, or record why it could not be taken.",
        }];
      }
      return [];
    }),
  );

  return {
    loading,
    loadError,
    state,
    currentSection,
    currentQuestion,
    currentValue,
    currentGroup,
    currentStepAnswers,
    currentSectionIdx: state.currentSectionIdx,
    currentQuestionIdx: state.currentQuestionIdx,
    stepNumber: currentNavigationIndex + 1,
    totalSteps: navigationHeads.length,
    isLastStep,
    canGoBack,
    canSkipCurrent,
    isCurrentDeferred,
    deferredCount: state.deferredAnswerIds.length,
    canGoNext,
    sectionProgress,
    overallProgress,
    allComplete,
    reviewIssues,
    performerMode: state.performerMode,
    inspectionScope: state.inspectionScope,
    catalogVersion: state.catalogVersion,
    revision: state.revision,
    saving: state.saving,
    submitting: state.submitting,
    submitError: state.submitError,
    missingAnswerIds: state.missingAnswerIds,
    invalidAnswers: state.invalidAnswers,
    setAnswer,
    setObservation,
    setSectionNotes,
    addMedia,
    removeMedia,
    nextQuestion,
    prevQuestion,
    skipCurrentQuestion,
    nextSection,
    prevSection,
    jumpToSection,
    jumpToAnswer,
    prepareReview,
    submitInspection,
  };
}

// ============================================================================
// usePpiResult
// Fetches request + current submission for the detail page
// ============================================================================

export function usePpiResult(requestId: string) {
  const [request, setRequest] = useState<PpiRequestResponse | null>(null);
  const [submission, setSubmission] = useState<PpiSubmissionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [reqRes, subRes] = await Promise.all([
          fetch(`/api/ppi/requests/${requestId}`),
          fetch(`/api/ppi/submissions?request_id=${requestId}`).catch(() => null),
        ]);

        if (reqRes.ok) {
          const { data } = await reqRes.json();
          setRequest(data);
        }

        if (subRes && subRes.ok) {
          const { data } = await subRes.json();
          setSubmission(data);
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [requestId]);

  return { request, submission, loading };
}
