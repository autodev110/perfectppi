import { z } from "zod";
import { generateStructuredOutput } from "./gemini";
import { buildStandardizedPrompt } from "./prompts/standardized-output";
import type { StandardizedContent } from "@/types/api";
import type { SectionType } from "@/types/enums";

const findingSchema = z.object({
  prompt: z.string(),
  answer: z.string(),
  severity: z.enum(["info", "minor", "moderate", "major", "critical"]),
});

const sectionSchema = z.object({
  section_type: z.enum([
    "vehicle_basics", "dashboard_warnings", "exterior", "interior",
    "engine_bay", "tires_brakes", "suspension_steering", "fluids",
    "electrical_controls", "underbody", "road_test", "modifications",
  ]),
  section_label: z.string(),
  summary: z.string(),
  condition_rating: z.enum(["excellent", "good", "fair", "poor", "not_applicable"]),
  findings: z.array(findingSchema),
  notes: z.string().nullable(),
});

const standardizedContentSchema = z.object({
  vehicle: z.object({
    year: z.number().nullable(),
    make: z.string().nullable(),
    model: z.string().nullable(),
    trim: z.string().nullable(),
    vin: z.string().nullable(),
    mileage: z.number().nullable(),
  }),
  inspection_metadata: z.object({
    ppi_type: z.enum(["personal", "general_tech", "certified_tech"]),
    performer_type: z.enum(["self", "technician"]),
    submitted_at: z.string(),
    version: z.number(),
  }),
  performer: z.object({
    display_name: z.string().nullable(),
    role: z.string(),
  }),
  sections: z.array(sectionSchema),
  overall_summary: z.string(),
  notable_findings: z.array(z.string()),
});

interface GeneratorInput {
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    mileage: number | null;
  };
  request: {
    ppi_type: string;
    performer_type: string;
  };
  submission: {
    submitted_at: string | null;
    version: number;
  };
  performer: {
    display_name: string | null;
    role: string;
  };
  sections: {
    section_type: SectionType;
    notes: string | null;
    answers: { prompt: string; answer_value: string | null; answer_type: string }[];
  }[];
}

export async function generateStandardizedOutput(
  data: GeneratorInput
): Promise<StandardizedContent> {
  const prompt = buildStandardizedPrompt({
    vehicle: data.vehicle,
    ppiType: data.request.ppi_type,
    performerType: data.request.performer_type,
    performer: data.performer,
    submittedAt: data.submission.submitted_at ?? new Date().toISOString(),
    version: data.submission.version,
    sections: data.sections,
  });

  return generateStructuredOutput<StandardizedContent>(prompt, standardizedContentSchema);
}
