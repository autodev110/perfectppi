import { z } from "zod";
import { generateStructuredOutput, type InlineMediaPart } from "./gemini";
import { buildStandardizedPrompt } from "./prompts/standardized-output";
import type { StandardizedContent } from "@/types/api";
import type { InspectionScope, SectionType } from "@/types/enums";

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
    // dents_tires scope
    "wheels_tires", "body_damage",
  ]),
  section_label: z.string(),
  summary: z.string(),
  condition_rating: z.enum(["excellent", "good", "fair", "poor", "not_applicable"]),
  findings: z.array(findingSchema),
  notes: z.string().nullable(),
});

const diagnosticsSchema = z.object({
  obd_snapshot_present: z.boolean(),
  vin: z.string().nullable(),
  adapter_name: z.string().nullable(),
  mil_on: z.boolean().nullable(),
  stored_dtc_count: z.number().int().nullable(),
  stored_dtcs: z.array(z.string()),
  pending_dtcs: z.array(z.string()),
  permanent_dtcs: z.array(z.string()),
  readiness_monitors: z.array(
    z.object({
      name: z.string(),
      is_continuous: z.boolean(),
      supported: z.boolean(),
      complete: z.boolean(),
    }),
  ),
  incomplete_monitor_count: z.number().int().min(0),
  live_readings: z.array(
    z.object({
      pid: z.string(),
      name: z.string(),
      value: z.number(),
      unit: z.string(),
    }),
  ),
  summary: z.string(),
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
    inspection_scope: z.enum(["complete", "dents_tires"]),
    performer_type: z.enum(["self", "technician"]),
    submitted_at: z.string(),
    version: z.number(),
  }),
  performer: z.object({
    display_name: z.string().nullable(),
    role: z.string(),
  }),
  sections: z.array(sectionSchema),
  diagnostics: diagnosticsSchema.nullable(),
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
    configuration_type: "stock" | "modified" | "custom_build";
    engine: string | null;
    drivetrain: string | null;
    transmission: string | null;
    engine_original: boolean;
    transmission_original: boolean;
    drivetrain_original: boolean;
    mileage_status: "actual" | "not_actual" | "unknown";
  };
  request: {
    ppi_type: string;
    inspection_scope: InspectionScope;
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
  photos?: {
    parts: InlineMediaPart[];
    manifest: { index: number; sectionType: string; prompt: string | null }[];
    omitted: number;
  };
  /** VIN-only adapter evidence for the Dents & Tires scope. */
  adapterVin?: string | null;
  obdSnapshot?: {
    vin: string | null;
    adapter_name: string | null;
    mil_on: boolean | null;
    stored_dtc_count: number | null;
    stored_dtcs: string[];
    pending_dtcs: string[];
    permanent_dtcs?: string[] | null;
    readiness_monitors?: unknown;
    incomplete_monitor_count?: number | null;
    supported_pids: string[];
    live_readings: unknown;
    started_at: string | null;
    completed_at: string | null;
  } | null;
}

export async function generateStandardizedOutput(
  data: GeneratorInput
): Promise<StandardizedContent> {
  const prompt = buildStandardizedPrompt({
    vehicle: data.vehicle,
    ppiType: data.request.ppi_type,
    inspectionScope: data.request.inspection_scope,
    performerType: data.request.performer_type,
    performer: data.performer,
    submittedAt: data.submission.submitted_at ?? new Date().toISOString(),
    version: data.submission.version,
    sections: data.sections,
    photoManifest: data.photos?.manifest ?? [],
    photosOmitted: data.photos?.omitted ?? 0,
    adapterVin: data.adapterVin ?? null,
    obdSnapshot: data.obdSnapshot ?? null,
  });

  return generateStructuredOutput<StandardizedContent>(prompt, standardizedContentSchema, {
    mediaParts: data.photos?.parts,
  });
}
