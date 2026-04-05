"use client";

import { useState, useEffect, useReducer, useCallback, useRef } from "react";
import { SECTION_QUESTION_TEMPLATES } from "@/features/ppi/constants";
import type {
  PpiRequestResponse,
  PpiSubmissionResponse,
  PpiSectionItem,
  PpiAnswerItem,
  PpiMediaItem,
} from "@/types/api";
import type { SectionType, CompletionState } from "@/types/enums";

// ============================================================================
// usePpiWizard
// Manages the multi-step intake wizard state
// ============================================================================

export type WizardStep =
  | "vehicle"
  | "vehicle_info"
  | "whose_car"
  | "requester_role"
  | "performer_type"
  | "select_tech"
  | "confirm";

export interface WizardFormState {
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
  "vehicle",
  "vehicle_info",
  "whose_car",
  "requester_role",
  "performer_type",
  "select_tech",
  "confirm",
];

export function usePpiWizard() {
  const [step, setStep] = useState<WizardStep>("vehicle");
  const [form, setForm] = useState<WizardFormState>({
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

  function update<K extends keyof WizardFormState>(key: K, value: WizardFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(): Promise<{ requestId: string; submissionId: string | null } | null> {
    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, string> = {
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
// useReducer-based guided inspection state with debounced auto-save
// ============================================================================

interface WorkflowState {
  sections: PpiSectionItem[];
  currentSectionIdx: number;
  currentQuestionIdx: number;
  answers: Map<string, string>;
  dirtyAnswerIds: Set<string>;
  dirtySectionIds: Set<string>;
  saving: "idle" | "saving" | "saved" | "error";
  lastSaved: Date | null;
  submitting: boolean;
  submitError: string | null;
  missingAnswerIds: Set<string>;
}

type WorkflowAction =
  | { type: "INIT"; sections: PpiSectionItem[] }
  | { type: "SET_ANSWER"; answerId: string; value: string }
  | { type: "SET_SECTION_NOTES"; sectionId: string; notes: string }
  | { type: "ADD_MEDIA"; sectionId: string; media: PpiMediaItem }
  | { type: "NEXT_QUESTION" }
  | { type: "PREV_QUESTION" }
  | { type: "NEXT_SECTION" }
  | { type: "PREV_SECTION" }
  | { type: "JUMP_TO_SECTION"; sectionIdx: number }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS" }
  | { type: "SAVE_ERROR" }
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

function hasRequiredPhoto(section: PpiSectionItem, answerId: string) {
  return section.media.some(
    (media) => media.ppi_answer_id === answerId || media.ppi_section_id === section.id
  );
}

function isSectionComplete(section: PpiSectionItem, answers: Map<string, string>) {
  const templates = SECTION_QUESTION_TEMPLATES[section.section_type as SectionType] ?? [];

  return section.answers.every((answer, index) => {
    const template = templates[index];
    const answerFilled = hasAnswerValue(answers.get(answer.id));
    const answerSatisfied = !answer.is_required || answerFilled;
    const photoSatisfied =
      !template?.requiresPhoto || hasRequiredPhoto(section, answer.id);

    return answerSatisfied && photoSatisfied;
  });
}

function deriveSectionState(
  section: PpiSectionItem,
  answers: Map<string, string>
): CompletionState {
  if (isSectionComplete(section, answers)) return "completed";
  if (sectionHasProgress(section, answers)) return "in_progress";
  return "not_started";
}

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case "INIT": {
      const answers = new Map<string, string>();
      for (const section of action.sections) {
        for (const answer of section.answers) {
          answers.set(answer.id, answer.answer_value ?? "");
        }
      }

      const dirtySectionIds = new Set<string>();
      const sections = action.sections.map((section) => {
        const completion_state = deriveSectionState(section, answers);
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
        currentSectionIdx: 0,
        currentQuestionIdx: 0,
      };
    }

    case "SET_ANSWER": {
      const newAnswers = new Map(state.answers);
      newAnswers.set(action.answerId, action.value);
      const newDirty = new Set(state.dirtyAnswerIds);
      newDirty.add(action.answerId);
      const newMissing = new Set(state.missingAnswerIds);
      newMissing.delete(action.answerId);
      const dirtySectionIds = new Set(state.dirtySectionIds);
      const sections = state.sections.map((section) => {
        if (!section.answers.some((answer) => answer.id === action.answerId)) {
          return section;
        }
        dirtySectionIds.add(section.id);
        return {
          ...section,
          completion_state: deriveSectionState(section, newAnswers),
        };
      });
      return {
        ...state,
        sections,
        answers: newAnswers,
        dirtyAnswerIds: newDirty,
        dirtySectionIds,
        missingAnswerIds: newMissing,
        saving: "idle",
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
          completion_state: deriveSectionState(nextSection, state.answers),
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
              completion_state: deriveSectionState(nextSection, state.answers),
            };
          }),
        };
      }

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
      const section = state.sections[state.currentSectionIdx];
      if (!section) return state;
      const nextQ = state.currentQuestionIdx + 1;
      if (nextQ < section.answers.length) {
        return { ...state, currentQuestionIdx: nextQ };
      }
      // Move to next section if at last question
      return workflowReducer(state, { type: "NEXT_SECTION" });
    }

    case "PREV_QUESTION": {
      if (state.currentQuestionIdx > 0) {
        return { ...state, currentQuestionIdx: state.currentQuestionIdx - 1 };
      }
      // Move to previous section, last question
      if (state.currentSectionIdx > 0) {
        const prevSection = state.sections[state.currentSectionIdx - 1];
        return {
          ...state,
          currentSectionIdx: state.currentSectionIdx - 1,
          currentQuestionIdx: Math.max(0, prevSection.answers.length - 1),
        };
      }
      return state;
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

    case "SAVE_START":
      return { ...state, saving: "saving" };

    case "SAVE_SUCCESS":
      return { ...state, saving: "saved", lastSaved: new Date() };

    case "SAVE_ERROR":
      return { ...state, saving: "error" };

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
  answers: new Map(),
  dirtyAnswerIds: new Set(),
  dirtySectionIds: new Set(),
  saving: "idle",
  lastSaved: null,
  submitting: false,
  submitError: null,
  missingAnswerIds: new Set(),
};

export function useInspectionWorkflow(submissionId: string) {
  const [state, dispatch] = useReducer(workflowReducer, initialWorkflowState);
  const [loading, setLoading] = useState(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load submission on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/ppi/submissions/${submissionId}`);
        if (!res.ok) return;
        const { data }: { data: PpiSubmissionResponse } = await res.json();
        dispatch({ type: "INIT", sections: data.sections });
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

      try {
        if (dirtyAnswerIds.size > 0) {
          const payload = Array.from(dirtyAnswerIds).map((answerId) => ({
            answerId,
            value: answers.get(answerId) ?? "",
          }));

          const res = await fetch(`/api/ppi/submissions/${submissionId}/answers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answers: payload }),
          });

          if (!res.ok) {
            dispatch({ type: "SAVE_ERROR" });
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

  function addMedia(sectionId: string, media: PpiMediaItem) {
    dispatch({ type: "ADD_MEDIA", sectionId, media });
  }

  async function submitInspection() {
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
      });
      const json = await res.json();

      if (!res.ok) {
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

  // Derived values
  const currentSection = state.sections[state.currentSectionIdx] ?? null;
  const currentQuestion: PpiAnswerItem | null =
    currentSection?.answers[state.currentQuestionIdx] ?? null;

  const isLastQuestion =
    currentSection
      ? state.currentQuestionIdx >= currentSection.answers.length - 1
      : false;
  const isLastSection = state.currentSectionIdx >= state.sections.length - 1;

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

  const currentValue = currentQuestion
    ? (state.answers.get(currentQuestion.id) ?? "")
    : "";

  const canGoNext =
    !currentQuestion?.is_required || (currentQuestion.is_required && currentValue !== "");

  return {
    loading,
    state,
    currentSection,
    currentQuestion,
    currentValue,
    currentSectionIdx: state.currentSectionIdx,
    currentQuestionIdx: state.currentQuestionIdx,
    isLastQuestion,
    isLastSection,
    canGoNext,
    sectionProgress,
    overallProgress,
    allComplete,
    saving: state.saving,
    submitting: state.submitting,
    submitError: state.submitError,
    missingAnswerIds: state.missingAnswerIds,
    setAnswer,
    setSectionNotes,
    addMedia,
    nextQuestion,
    prevQuestion,
    nextSection,
    prevSection,
    jumpToSection,
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
