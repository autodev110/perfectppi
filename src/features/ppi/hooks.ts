"use client";

import { useState, useEffect, useReducer, useCallback, useRef } from "react";
import type { PpiRequestResponse, PpiSubmissionResponse, PpiSectionItem, PpiAnswerItem } from "@/types/api";

// ============================================================================
// usePpiWizard
// Manages the multi-step intake wizard state
// ============================================================================

export type WizardStep =
  | "vehicle"
  | "whose_car"
  | "requester_role"
  | "performer_type"
  | "select_tech"
  | "confirm";

export interface WizardFormState {
  vehicle_id: string;
  whose_car: "own" | "other" | null;
  requester_role: "buying" | "selling" | "documenting" | null;
  performer_type: "self" | "technician" | null;
  assigned_tech_profile_id: string | null;
  selected_tech_name: string | null;
}

const WIZARD_STEPS: WizardStep[] = [
  "vehicle",
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
  answers: Map<string, string>;         // answerId → value
  dirtyAnswerIds: Set<string>;
  saving: "idle" | "saving" | "saved" | "error";
  lastSaved: Date | null;
  submitting: boolean;
  submitError: string | null;
  missingAnswerIds: Set<string>;
}

type WorkflowAction =
  | { type: "INIT"; sections: PpiSectionItem[] }
  | { type: "SET_ANSWER"; answerId: string; value: string }
  | { type: "NEXT_QUESTION" }
  | { type: "PREV_QUESTION" }
  | { type: "NEXT_SECTION" }
  | { type: "PREV_SECTION" }
  | { type: "JUMP_TO_SECTION"; sectionIdx: number }
  | { type: "SAVE_START" }
  | { type: "SAVE_SUCCESS" }
  | { type: "SAVE_ERROR" }
  | { type: "MARK_DIRTY_FLUSHED" }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_ERROR"; message: string; missingIds: string[] }
  | { type: "CLEAR_MISSING"; answerId: string };

function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case "INIT": {
      const answers = new Map<string, string>();
      for (const section of action.sections) {
        for (const answer of section.answers) {
          answers.set(answer.id, answer.answer_value ?? "");
        }
      }
      return {
        ...state,
        sections: action.sections,
        answers,
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
      return {
        ...state,
        answers: newAnswers,
        dirtyAnswerIds: newDirty,
        missingAnswerIds: newMissing,
        saving: "idle",
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

    case "MARK_DIRTY_FLUSHED":
      return { ...state, dirtyAnswerIds: new Set(), saving: "saved", lastSaved: new Date() };

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
    async (dirtyIds: Set<string>, answers: Map<string, string>) => {
      if (dirtyIds.size === 0) return;

      dispatch({ type: "SAVE_START" });
      const payload = Array.from(dirtyIds).map((answerId) => ({
        answerId,
        value: answers.get(answerId) ?? "",
      }));

      try {
        const res = await fetch(`/api/ppi/submissions/${submissionId}/answers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: payload }),
        });

        if (res.ok) {
          dispatch({ type: "MARK_DIRTY_FLUSHED" });
        } else {
          dispatch({ type: "SAVE_ERROR" });
        }
      } catch {
        dispatch({ type: "SAVE_ERROR" });
      }
    },
    [submissionId]
  );

  // Trigger debounced save whenever dirty set changes
  useEffect(() => {
    if (state.dirtyAnswerIds.size === 0) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      flushDirty(state.dirtyAnswerIds, state.answers);
    }, 1500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [state.dirtyAnswerIds, state.answers, flushDirty]);

  // Immediate flush (called before navigating section)
  const immediateFlush = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    flushDirty(state.dirtyAnswerIds, state.answers);
  }, [flushDirty, state.dirtyAnswerIds, state.answers]);

  function setAnswer(answerId: string, value: string) {
    dispatch({ type: "SET_ANSWER", answerId, value });
  }

  function nextQuestion() {
    immediateFlush();
    dispatch({ type: "NEXT_QUESTION" });
  }

  function prevQuestion() {
    immediateFlush();
    dispatch({ type: "PREV_QUESTION" });
  }

  function nextSection() {
    immediateFlush();
    dispatch({ type: "NEXT_SECTION" });
  }

  function prevSection() {
    immediateFlush();
    dispatch({ type: "PREV_SECTION" });
  }

  function jumpToSection(idx: number) {
    immediateFlush();
    dispatch({ type: "JUMP_TO_SECTION", sectionIdx: idx });
  }

  async function submitInspection() {
    immediateFlush();
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
      completed: answered >= total || s.completion_state === "completed",
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
