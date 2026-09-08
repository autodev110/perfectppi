import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { privateStorageReference } from "@/lib/storage/r2";
import { deleteStoredObjectOrQueue } from "@/features/uploads/cleanup";

export async function collectInspectionStorageReferences(requestIds: string[]) {
  if (requestIds.length === 0) return [];

  const admin = createAdminClient();
  const { data: submissions, error: submissionsError } = await admin
    .from("ppi_submissions")
    .select("id")
    .in("ppi_request_id", requestIds);
  if (submissionsError) throw new Error("Could not inspect submission storage");
  const submissionIds = (submissions ?? []).map(({ id }) => id);
  if (submissionIds.length === 0) return [];

  const { data: sections, error: sectionsError } = await admin
    .from("ppi_sections")
    .select("id")
    .in("ppi_submission_id", submissionIds);
  if (sectionsError) throw new Error("Could not inspect submission media");
  const sectionIds = (sections ?? []).map(({ id }) => id);

  const [mediaResult, artifactResult, standardizedResult, vscResult] = await Promise.all([
    sectionIds.length
      ? admin.from("ppi_media").select("url").in("ppi_section_id", sectionIds)
      : Promise.resolve({ data: [] as { url: string }[], error: null }),
    admin.from("integration_artifacts").select("storage_key").in("ppi_submission_id", submissionIds),
    admin.from("standardized_outputs").select("document_url").in("ppi_submission_id", submissionIds),
    admin.from("vsc_outputs").select("document_url").in("ppi_submission_id", submissionIds),
  ]);
  if (mediaResult.error || artifactResult.error || standardizedResult.error || vscResult.error) {
    throw new Error("Could not inspect all inspection storage");
  }

  return [...new Set([
    ...(mediaResult.data ?? []).map(({ url }) => url),
    ...(artifactResult.data ?? []).map(({ storage_key }) => privateStorageReference(storage_key)),
    ...(standardizedResult.data ?? []).flatMap(({ document_url }) => document_url ? [document_url] : []),
    ...(vscResult.data ?? []).flatMap(({ document_url }) => document_url ? [document_url] : []),
  ])];
}

export async function cleanupInspectionStorage(references: string[], reason: string) {
  await Promise.all(references.map((reference) =>
    deleteStoredObjectOrQueue(reference, reason)
  ));
}

export async function deleteOwnedInspection(requestId: string, requesterId: string) {
  const admin = createAdminClient();
  const { data: request } = await admin
    .from("ppi_requests")
    .select("id")
    .eq("id", requestId)
    .eq("requester_id", requesterId)
    .maybeSingle();
  if (!request) return { error: "Inspection not found" as const };

  let references: string[];
  try {
    references = await collectInspectionStorageReferences([requestId]);
  } catch {
    return { error: "The inspection could not be prepared for deletion. Please try again." as const };
  }
  const { error } = await admin
    .from("ppi_requests")
    .delete()
    .eq("id", requestId)
    .eq("requester_id", requesterId);
  if (error) return { error: "The inspection could not be deleted. Please try again." as const };

  await cleanupInspectionStorage(references, "inspection_deleted");
  return { success: true as const };
}
