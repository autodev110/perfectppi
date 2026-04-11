import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_PERFECTPPI ?? process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Gemini is not configured — set GEMINI_PERFECTPPI or GEMINI_API_KEY");
  }
  return key;
}

const genAI = new GoogleGenerativeAI(getGeminiApiKey());

export function getGeminiModel(modelName = "gemini-2.0-flash") {
  return genAI.getGenerativeModel({ model: modelName });
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function isRateLimitError(error: Error): boolean {
  return (
    error.message.includes("429") ||
    error.message.includes("RESOURCE_EXHAUSTED")
  );
}

function parseAndValidate<T>(text: string, schema: z.ZodType<T>): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Gemini JSON parse failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(
      `Gemini response validation failed: ${JSON.stringify(validated.error.errors.slice(0, 3))}`
    );
  }

  return validated.data;
}

/**
 * Call Gemini with JSON mode, validate with Zod, and retry with backoff on 429s.
 */
export async function generateStructuredOutput<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options?: { maxRetries?: number; model?: string }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const model = getGeminiModel(options?.model);

  let lastError: Error | null = null;
  let clarifiedRetryUsed = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      });

      return parseAndValidate(result.response.text(), schema);
    } catch (err: unknown) {
      let normalizedError = toError(err);

      const isStructuredFailure =
        normalizedError.message.startsWith("Gemini JSON parse failed:") ||
        normalizedError.message.startsWith("Gemini response validation failed:");

      // Retry once with clarified instructions for parse/schema issues.
      if (isStructuredFailure && !clarifiedRetryUsed) {
        clarifiedRetryUsed = true;
        const clarifiedPrompt = `${prompt}\n\nIMPORTANT: Your previous response failed structured parsing/validation. Error: ${normalizedError.message}. Return ONLY valid JSON that matches the required schema exactly.`;

        try {
          const retryResult = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: clarifiedPrompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
            },
          });

          return parseAndValidate(retryResult.response.text(), schema);
        } catch (clarifiedError) {
          normalizedError = toError(clarifiedError);
        }
      }

      lastError = normalizedError;

      // Retry on 429 (rate limit) with exponential backoff
      if (isRateLimitError(normalizedError) && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Non-rate-limit error or out of retries
      break;
    }
  }

  throw lastError ?? new Error("Gemini generation failed");
}
