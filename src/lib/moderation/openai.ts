import type { ModerationResult } from "./types";

const MODEL = "omni-moderation-latest";
const MODEL_VERSION = "perfectppi-moderation-v1";

type OpenAIModerationResult = {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
  category_applied_input_types?: Record<string, string[]>;
};

type OpenAIModerationResponse = {
  model?: string;
  results?: OpenAIModerationResult[];
};

export function classifyModerationProviderResult(result: OpenAIModerationResult): Pick<ModerationResult, "decision" | "riskLevel" | "reasonCodes"> {
  const flagged = Object.entries(result.categories)
    .filter(([, value]) => value)
    .map(([name]) => name);

  const critical = flagged.filter((name) =>
    ["sexual/minors"].includes(name),
  );
  if (critical.length > 0) {
    return { decision: "legal_hold", riskLevel: "critical", reasonCodes: critical };
  }

  const severe = flagged.filter((name) =>
    [
      "hate/threatening",
      "harassment/threatening",
      "self-harm/instructions",
      "self-harm/intent",
      "violence/graphic",
    ].includes(name),
  );
  const highestScore = Math.max(0, ...Object.values(result.category_scores));

  if (severe.length > 0 && highestScore >= 0.85) {
    return { decision: "block", riskLevel: "high", reasonCodes: severe };
  }
  if (result.flagged || flagged.length > 0) {
    return {
      decision: highestScore >= 0.9 ? "block" : "review",
      riskLevel: highestScore >= 0.9 ? "high" : "medium",
      reasonCodes: flagged.length > 0 ? flagged : ["provider_flagged"],
    };
  }

  return { decision: "allow", riskLevel: "none", reasonCodes: [] };
}

async function requestModeration(input: unknown): Promise<ModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      decision: "review",
      riskLevel: "medium",
      reasonCodes: ["classifier_unavailable"],
      provider: "native_rules",
      modelName: null,
      modelVersion: MODEL_VERSION,
      rawResult: { configured: false },
    };
  }

  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Moderation provider returned ${response.status}`);
  }

  const payload = (await response.json()) as OpenAIModerationResponse;
  const result = payload.results?.[0];
  if (!result) throw new Error("Moderation provider returned no result");

  const classified = classifyModerationProviderResult(result);
  return {
    ...classified,
    provider: "openai",
    modelName: payload.model ?? MODEL,
    modelVersion: MODEL_VERSION,
    rawResult: {
      flagged: result.flagged,
      categories: result.categories,
      categoryScores: result.category_scores,
      appliedInputTypes: result.category_applied_input_types ?? {},
    },
  };
}

export async function moderateTextWithProvider(text: string): Promise<ModerationResult> {
  return requestModeration([{ type: "text", text }]);
}

export async function moderateImageWithProvider(bytes: Uint8Array, contentType: string): Promise<ModerationResult> {
  const imageUrl = `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  return requestModeration([{ type: "image_url", image_url: { url: imageUrl } }]);
}
