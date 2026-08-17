import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { generateStandardizedOutput } from "@/lib/ai/standardized-generator";
import { generateVscCoverage } from "@/lib/ai/vsc-generator";
import { generateStandardizedReportPdf } from "@/lib/pdf/standardized-report-pdf";
import { generateVscDeterminationPdf } from "@/lib/pdf/vsc-determination-pdf";
import {
  isPrivateR2Configured,
  privateStorageReference,
  uploadPrivateObject,
} from "@/lib/storage/r2";
import {
  ARTIFACT_CONTENT_TYPES,
  REQUIRED_ARTIFACT_TYPES,
  type ArtifactType,
} from "@/features/partner/constants";
import { setIntegrationStatus } from "@/features/partner/events";
import type { Json } from "@/types/database";
import type { StandardizedContent, VscCoverageData } from "@/types/api";
import type { SectionType } from "@/types/enums";

// ============================================================================
// Output generation, as a resumable job.
//
// Every step is idempotent and keyed by (submission, output_version), so a job
// that dies halfway through picks up exactly where it stopped instead of
// regenerating work that already succeeded — and, critically, without minting a
// phantom new version. Four artifacts must exist before the partner
// deliverables are considered ready; a partial set never is.
// ============================================================================

export type OutputJobFailureCategory =
  | "submission_state"
  | "ai_generation"
  | "storage"
  | "database"
  | "configuration";

export class OutputJobError extends Error {
  constructor(
    public readonly category: OutputJobFailureCategory,
    message: string,
    /** Permanent failures skip the remaining retry budget. */
    public readonly permanent = false,
  ) {
    super(message);
    this.name = "OutputJobError";
  }
}

export interface OutputJobResult {
  submissionId: string;
  outputVersion: number;
  standardizedOutputId: string;
  vscOutputId: string;
  artifactIds: string[];
  reusedArtifacts: number;
}

/**
 * Stable JSON bytes. The checksum recorded for a JSON artifact must describe
 * exactly the bytes a partner downloads, so serialization happens once, here,
 * and the resulting buffer is what gets hashed, uploaded, and measured.
 */
function canonicalJsonBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, null, 2), "utf8");
}

function sha256OfBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function runOutputGenerationJob(params: {
  submissionId: string;
  outputVersion: number;
}): Promise<OutputJobResult> {
  const { submissionId, outputVersion } = params;
  const admin = createAdminClient();

  if (!isPrivateR2Configured()) {
    throw new OutputJobError(
      "configuration",
      "Private R2 artifact storage is not configured.",
      true,
    );
  }

  if (!isGeminiConfigured()) {
    throw new OutputJobError(
      "configuration",
      "Gemini is not configured; set GEMINI_PERFECTPPI or GEMINI_API_KEY.",
      true,
    );
  }

  // --- Load the submission and everything the generators need ---------------

  const { data: submission, error: submissionError } = await admin
    .from("ppi_submissions")
    .select(
      `
      id, ppi_request_id, performer_id, version, status, submitted_at,
      sections:ppi_sections(
        id, section_type, notes, sort_order,
        answers:ppi_answers(prompt, answer_value, answer_type, sort_order)
      )
    `,
    )
    .eq("id", submissionId)
    .single();

  if (submissionError || !submission) {
    throw new OutputJobError(
      "submission_state",
      submissionError?.message ?? "Submission not found",
      true,
    );
  }

  if (submission.status !== "submitted" && submission.status !== "completed") {
    // Not retryable: an inspection reopened for editing will enqueue a fresh
    // job when it is submitted again.
    throw new OutputJobError(
      "submission_state",
      `Submission status is "${submission.status}", expected "submitted".`,
      true,
    );
  }

  const { data: request } = await admin
    .from("ppi_requests")
    .select(
      `
      id, ppi_type, performer_type, requester_id, requesting_organization_id,
      vehicle:vehicles(year, make, model, trim, vin, mileage)
    `,
    )
    .eq("id", submission.ppi_request_id)
    .single();

  if (!request) {
    throw new OutputJobError("submission_state", "Parent request not found", true);
  }

  const { data: performer } = await admin
    .from("profiles")
    .select("display_name, role")
    .eq("id", submission.performer_id)
    .single();

  const vehicle = request.vehicle as {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    mileage: number | null;
  } | null;

  const sortedSections = [...(submission.sections ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((section) => ({
      section_type: section.section_type as SectionType,
      notes: section.notes,
      answers: [...(section.answers ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((answer) => ({
          prompt: answer.prompt,
          answer_value: answer.answer_value,
          answer_type: answer.answer_type,
        })),
    }));

  const { data: obdSnapshot } = await admin
    .from("obd_snapshots")
    .select(
      "vin, adapter_name, mil_on, stored_dtc_count, stored_dtcs, pending_dtcs, supported_pids, live_readings, started_at, completed_at",
    )
    .eq("ppi_submission_id", submissionId)
    .eq("is_current", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Organization-owned inspections have no consumer requester, so the storage
  // prefix follows whichever ownership path the request actually uses.
  const ownerScope =
    request.requesting_organization_id ?? request.requester_id ?? "unowned";

  // --- Stage 1: standardized output (reused when already present) -----------

  const { data: existingStandardized } = await admin
    .from("standardized_outputs")
    .select("id, structured_content, document_url")
    .eq("ppi_submission_id", submissionId)
    .eq("version", outputVersion)
    .maybeSingle();

  let standardizedContent: StandardizedContent;
  let standardizedOutputId: string;

  if (existingStandardized) {
    standardizedContent =
      existingStandardized.structured_content as unknown as StandardizedContent;
    standardizedOutputId = existingStandardized.id;
  } else {
    try {
      standardizedContent = await generateStandardizedOutput({
        vehicle:
          vehicle ?? {
            year: null,
            make: null,
            model: null,
            trim: null,
            vin: null,
            mileage: null,
          },
        request: {
          ppi_type: request.ppi_type,
          performer_type: request.performer_type,
        },
        submission: {
          submitted_at: submission.submitted_at,
          version: submission.version,
        },
        performer: {
          display_name: performer?.display_name ?? null,
          role: performer?.role ?? "consumer",
        },
        sections: sortedSections,
        obdSnapshot: obdSnapshot ?? null,
      });
    } catch (error) {
      throw new OutputJobError(
        "ai_generation",
        `Standardized output generation failed: ${asMessage(error)}`,
      );
    }

    const { data: inserted, error: insertError } = await admin
      .from("standardized_outputs")
      .insert({
        ppi_submission_id: submissionId,
        version: outputVersion,
        structured_content: standardizedContent as unknown as Json,
        document_url: null,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      // A concurrent worker may have won the (submission, version) unique
      // constraint; adopt its row rather than fail the job.
      const { data: raced } = await admin
        .from("standardized_outputs")
        .select("id, structured_content")
        .eq("ppi_submission_id", submissionId)
        .eq("version", outputVersion)
        .maybeSingle();

      if (!raced) {
        throw new OutputJobError(
          "database",
          insertError?.message ?? "Failed to store standardized output",
        );
      }
      standardizedContent = raced.structured_content as unknown as StandardizedContent;
      standardizedOutputId = raced.id;
    } else {
      standardizedOutputId = inserted.id;
    }
  }

  // --- Stage 2: VSC coverage (reused when already present) ------------------

  const { data: existingVsc } = await admin
    .from("vsc_outputs")
    .select("id, coverage_data")
    .eq("ppi_submission_id", submissionId)
    .eq("version", outputVersion)
    .maybeSingle();

  let coverageData: VscCoverageData;
  let vscOutputId: string;

  if (existingVsc) {
    coverageData = existingVsc.coverage_data as unknown as VscCoverageData;
    vscOutputId = existingVsc.id;
  } else {
    try {
      coverageData = await generateVscCoverage(standardizedContent);
    } catch (error) {
      throw new OutputJobError(
        "ai_generation",
        `VSC generation failed: ${asMessage(error)}`,
      );
    }

    const { data: inserted, error: insertError } = await admin
      .from("vsc_outputs")
      .insert({
        ppi_submission_id: submissionId,
        standardized_output_id: standardizedOutputId,
        version: outputVersion,
        coverage_data: coverageData as unknown as Json,
        document_url: null,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      const { data: raced } = await admin
        .from("vsc_outputs")
        .select("id, coverage_data")
        .eq("ppi_submission_id", submissionId)
        .eq("version", outputVersion)
        .maybeSingle();

      if (!raced) {
        throw new OutputJobError(
          "database",
          insertError?.message ?? "Failed to store VSC output",
        );
      }
      coverageData = raced.coverage_data as unknown as VscCoverageData;
      vscOutputId = raced.id;
    } else {
      vscOutputId = inserted.id;
    }
  }

  // --- Artifacts ------------------------------------------------------------

  const { data: refRow } = await admin
    .from("external_inspection_refs")
    .select("id")
    .eq("ppi_request_id", request.id)
    .maybeSingle();

  const generatedAt = new Date().toISOString();

  // Built on demand. A retry that finds all four artifacts already stored must
  // not re-render two PDFs just to throw them away.
  const buildBody: Record<ArtifactType, () => Buffer> = {
    inspection_report_json: () =>
      canonicalJsonBytes({
        submissionId,
        outputVersion,
        generatedAt,
        report: standardizedContent,
      }),
    inspection_report_pdf: () => generateStandardizedReportPdf(standardizedContent),
    vsc_determination_json: () =>
      canonicalJsonBytes({
        submissionId,
        outputVersion,
        generatedAt,
        determination: coverageData,
      }),
    vsc_determination_pdf: () =>
      generateVscDeterminationPdf(coverageData, standardizedContent, {
        submissionId,
        outputVersion,
        generatedAt,
        submissionVersion: submission.version,
      }),
  };

  const { data: existingArtifacts } = await admin
    .from("integration_artifacts")
    .select("id, artifact_type, storage_key")
    .eq("ppi_submission_id", submissionId)
    .eq("output_version", outputVersion);

  const alreadyStored = new Map(
    (existingArtifacts ?? []).map((row) => [row.artifact_type, row]),
  );

  const artifactIds: string[] = [];
  let reusedArtifacts = 0;
  const storageKeys: Partial<Record<ArtifactType, string>> = {};

  for (const artifactType of REQUIRED_ARTIFACT_TYPES) {
    const existing = alreadyStored.get(artifactType);
    if (existing) {
      // Already uploaded and checksummed on a previous attempt. Regenerating it
      // would produce different bytes (new timestamp) and a checksum a partner
      // may already have recorded, so the completed work stands.
      artifactIds.push(existing.id);
      storageKeys[artifactType] = existing.storage_key;
      reusedArtifacts += 1;
      continue;
    }

    const bytes = buildBody[artifactType]();
    const checksum = sha256OfBytes(bytes);
    const extension = artifactType.endsWith("_pdf") ? "pdf" : "json";
    // The digest in the key makes concurrent writes non-destructive: workers
    // that somehow produce different bytes cannot overwrite each other before
    // the unique artifact row decides which immutable version wins.
    const storageKey = `integration_artifacts/${ownerScope}/${submissionId}/v${outputVersion}/${artifactType}-${checksum}.${extension}`;

    try {
      await uploadPrivateObject({
        key: storageKey,
        body: bytes,
        contentType: ARTIFACT_CONTENT_TYPES[artifactType],
      });
    } catch (error) {
      throw new OutputJobError(
        "storage",
        `Failed to upload ${artifactType}: ${asMessage(error)}`,
      );
    }

    const { data: artifact, error: artifactError } = await admin
      .from("integration_artifacts")
      .insert({
        external_inspection_ref_id: refRow?.id ?? null,
        ppi_submission_id: submissionId,
        output_version: outputVersion,
        artifact_type: artifactType,
        content_type: ARTIFACT_CONTENT_TYPES[artifactType],
        size_bytes: bytes.byteLength,
        sha256: checksum,
        storage_key: storageKey,
        generated_at: generatedAt,
      })
      .select("id")
      .single();

    if (artifactError || !artifact) {
      const { data: raced } = await admin
        .from("integration_artifacts")
        .select("id, storage_key")
        .eq("ppi_submission_id", submissionId)
        .eq("output_version", outputVersion)
        .eq("artifact_type", artifactType)
        .maybeSingle();

      if (!raced) {
        throw new OutputJobError(
          "database",
          artifactError?.message ?? `Failed to record ${artifactType}`,
        );
      }
      artifactIds.push(raced.id);
      storageKeys[artifactType] = raced.storage_key;
      continue;
    }

    artifactIds.push(artifact.id);
    storageKeys[artifactType] = storageKey;
  }

  // Viewer routes understand this opaque private storage reference and mint a
  // short-lived signed GET URL only after their own authorization checks.
  if (storageKeys.inspection_report_pdf && storageKeys.vsc_determination_pdf) {
    await admin
      .from("standardized_outputs")
      .update({
        document_url: privateStorageReference(storageKeys.inspection_report_pdf),
      })
      .eq("id", standardizedOutputId)
      .is("document_url", null);

    await admin
      .from("vsc_outputs")
      .update({
        document_url: privateStorageReference(storageKeys.vsc_determination_pdf),
      })
      .eq("id", vscOutputId)
      .is("document_url", null);
  }

  if (artifactIds.length !== REQUIRED_ARTIFACT_TYPES.length) {
    throw new OutputJobError(
      "database",
      `Expected ${REQUIRED_ARTIFACT_TYPES.length} artifacts, produced ${artifactIds.length}`,
    );
  }

  await admin
    .from("external_inspection_refs")
    .update({ current_submission_id: submissionId })
    .eq("ppi_request_id", request.id);

  // Only now — with every required artifact stored and checksummed — is the
  // inspection advertised as deliverable.
  await setIntegrationStatus(request.id, "deliverables_ready");

  return {
    submissionId,
    outputVersion,
    standardizedOutputId,
    vscOutputId,
    artifactIds,
    reusedArtifacts,
  };
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
