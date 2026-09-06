import type { AnswerType } from "@/types/enums";

export const DENTS_TIRES_TREAD_QUESTIONS = [
  { corner: "Front left", prompt: "Front left tire tread depth (in 32nds of an inch)" },
  { corner: "Front right", prompt: "Front right tire tread depth (in 32nds of an inch)" },
  { corner: "Rear left", prompt: "Rear left tire tread depth (in 32nds of an inch)" },
  { corner: "Rear right", prompt: "Rear right tire tread depth (in 32nds of an inch)" },
] as const;

const TREAD_PROMPTS = new Set<string>(
  DENTS_TIRES_TREAD_QUESTIONS.map((item) => item.prompt),
);

export const TIRE_TREAD_MIN_32NDS = 0;
export const TIRE_TREAD_MAX_32NDS = 32;
export const TIRE_REPLACEMENT_THRESHOLD_32NDS = 2;

export interface NumberInputConstraints {
  min: number;
  max: number;
  step: number;
  unit: string;
}

export function numberInputConstraints(prompt: string): NumberInputConstraints | null {
  if (!TREAD_PROMPTS.has(prompt)) return null;
  return {
    min: TIRE_TREAD_MIN_32NDS,
    max: TIRE_TREAD_MAX_32NDS,
    step: 1,
    unit: "/32 in",
  };
}

export function inspectionAnswerValidationError(input: {
  prompt: string;
  answerType: AnswerType;
  value: string | null | undefined;
  required: boolean;
  options?: string[] | null;
}): string | null {
  const value = input.value?.trim() ?? "";
  if (!value) return input.required ? "This question is required." : null;

  if (input.answerType === "yes_no" && value !== "yes" && value !== "no") {
    return "Choose Yes or No.";
  }

  if (
    input.answerType === "select" &&
    input.options?.length &&
    !input.options.includes(value)
  ) {
    return "Choose one of the available options.";
  }

  if (input.answerType === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return "Enter a valid number.";

    const constraints = numberInputConstraints(input.prompt);
    if (constraints) {
      if (!Number.isInteger(parsed)) {
        return `Enter tread depth as a whole number from ${constraints.min} to ${constraints.max}.`;
      }
      if (parsed < constraints.min || parsed > constraints.max) {
        return `Enter tread depth from ${constraints.min}/32 to ${constraints.max}/32.`;
      }
    }
  }

  return null;
}
