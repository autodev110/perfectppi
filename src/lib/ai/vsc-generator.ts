import { z } from "zod";
import { generateStructuredOutput } from "./gemini";
import { buildVscPrompt } from "./prompts/vsc-generation";
import type { StandardizedContent, VscCoverageData } from "@/types/api";

const componentSchema = z.object({
  component: z.string(),
  category: z.string(),
  determination: z.enum(["covered", "excluded", "limited"]),
  reasoning: z.string(),
  conditions: z.array(z.string()),
});

const vscCoverageSchema = z.object({
  overall_eligibility: z.enum(["eligible", "conditional", "ineligible"]),
  eligibility_summary: z.string(),
  components: z.array(componentSchema),
});

export async function generateVscCoverage(
  standardizedContent: StandardizedContent
): Promise<VscCoverageData> {
  const prompt = buildVscPrompt(standardizedContent);

  return generateStructuredOutput<VscCoverageData>(prompt, vscCoverageSchema);
}
