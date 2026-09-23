import { z } from "zod";

// ============================================================================
// TypeSafe Jev client (https://docs.typesafe.ai/api).
//
// Jev answers typed questions about text/structured state. It is used only for
// bounded semantic classification of free-text notes after the inspector has
// confirmed the structured facts; it never reads images, does arithmetic,
// writes prose, or decides a safety rule. The key lives only on the server.
// ============================================================================

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
/** Pinned: a released policy never changes because "latest" moved. */
export const JEV_MODEL = process.env.TYPESAFE_JEV_MODEL ?? "jev-1.13.0";

export type JevMode = "off" | "shadow" | "on";

export function jevMode(): JevMode {
  if (!process.env.TYPESAFE_API_KEY) return "off";
  const configured = (process.env.TYPESAFE_JEV_MODE ?? "shadow").toLowerCase();
  return configured === "on" || configured === "off" ? configured : "shadow";
}

export interface JevChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface JevChoiceAnswer {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export class JevError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = "JevError";
    this.status = status;
    this.retryable = retryable;
  }
}

const answerSchema = z.object({
  choice: z.string(),
  probabilities: z.record(z.number()),
  confidence: z.number(),
});

const responseSchema = z.object({ answers: z.record(z.unknown()) });

/**
 * Asks independent `choice` questions against one shared state. Every
 * returned key, option and probability is validated; anything unexpected is
 * an error, never a silently accepted classification.
 */
export async function askJevChoices(
  state: Record<string, unknown>,
  questions: Record<string, JevChoiceQuestion>,
  options: { timeoutMs?: number; maxAttempts?: number; fetchImpl?: typeof fetch } = {},
): Promise<Record<string, JevChoiceAnswer>> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new JevError("TYPESAFE_API_KEY is not configured.", null, false);
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? 3;

  let lastError: JevError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
    try {
      const response = await fetchImpl(JEV_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: JEV_MODEL, state, questions }),
        signal: controller.signal,
      });
      if (response.status === 429 || response.status === 529 || response.status >= 500) {
        lastError = new JevError(`TypeSafe responded ${response.status}`, response.status, true);
      } else if (!response.ok) {
        // 401/422 and other client errors are configuration or request bugs.
        throw new JevError(`TypeSafe rejected the request (${response.status})`, response.status, false);
      } else {
        const parsed = responseSchema.safeParse(await response.json());
        if (!parsed.success) throw new JevError("TypeSafe response did not match the contract.", response.status, false);
        return validateAnswers(parsed.data.answers, questions);
      }
    } catch (error) {
      if (error instanceof JevError && !error.retryable) throw error;
      lastError = error instanceof JevError
        ? error
        : new JevError(error instanceof Error ? error.message : String(error), null, true);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(4_000, 400 * 2 ** (attempt - 1))));
    }
  }
  throw lastError ?? new JevError("TypeSafe request failed.", null, true);
}

export function validateAnswers(
  answers: Record<string, unknown>,
  questions: Record<string, JevChoiceQuestion>,
): Record<string, JevChoiceAnswer> {
  const result: Record<string, JevChoiceAnswer> = {};
  for (const [name, question] of Object.entries(questions)) {
    const parsed = answerSchema.safeParse(answers[name]);
    if (!parsed.success) throw new JevError(`Missing or malformed answer for ${name}.`, null, false);
    const options = Object.keys(question.criteria);
    const answer = parsed.data;
    if (!options.includes(answer.choice)) throw new JevError(`Unknown option "${answer.choice}" for ${name}.`, null, false);
    for (const [option, probability] of Object.entries(answer.probabilities)) {
      if (!options.includes(option) || !Number.isFinite(probability) || probability < 0 || probability > 1) {
        throw new JevError(`Invalid probability for ${name}.${option}.`, null, false);
      }
    }
    if (!Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) {
      throw new JevError(`Invalid confidence for ${name}.`, null, false);
    }
    result[name] = answer;
  }
  return result;
}
