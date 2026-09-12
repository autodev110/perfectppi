// Inspection sharing on listings (plan 25.3). The seller chooses which of
// their own inspections to attach; buyers get the redacted projection from
// `marketplace_inspection_report`, which is the only path to inspection
// content for anyone but the requester.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSocialProfileId } from "@/features/social/relationships";
import { parseInspectionReport, type InspectionReport } from "@/lib/marketplace/inspection-report";
import type { Database } from "@/types/database";

export type AttachableInspection = {
  request_id: string;
  scope: Database["public"]["Enums"]["inspection_scope"];
  inspected_at: string;
  performer_type: Database["public"]["Enums"]["performer_type"];
  performed_by: string;
  request_status: Database["public"]["Enums"]["ppi_request_status"];
  attached: boolean;
};

/** The redacted report for one inspection request, or null when not permitted. */
export async function getInspectionReport(requestId: string, viewerId?: string | null): Promise<InspectionReport | null> {
  const viewer = viewerId === undefined ? await getCurrentSocialProfileId() : viewerId;
  const { data, error } = await createAdminClient().rpc("marketplace_inspection_report", {
    p_viewer_id: viewer,
    p_request_id: requestId,
  });
  if (error) {
    console.error("marketplace_inspection_report failed", error.message);
    return null;
  }
  return parseInspectionReport(data);
}

/** The listing's shared report as the current viewer may see it. */
export async function getListingInspectionReport(listingId: string): Promise<InspectionReport | null> {
  const { data } = await createAdminClient()
    .from("marketplace_listings")
    .select("attached_inspection_id")
    .eq("id", listingId)
    .maybeSingle();
  if (!data?.attached_inspection_id) return null;
  return getInspectionReport(data.attached_inspection_id);
}

/** Owner only: inspections the seller may share on this listing. */
export async function getAttachableInspections(listingId: string): Promise<AttachableInspection[]> {
  const viewerId = await getCurrentSocialProfileId();
  if (!viewerId) return [];
  const { data, error } = await createAdminClient().rpc("list_attachable_listing_inspections", {
    p_actor_profile_id: viewerId,
    p_listing_id: listingId,
  });
  if (error) {
    console.error("list_attachable_listing_inspections failed", error.message);
    return [];
  }
  return data ?? [];
}

export type AttachInspectionResult =
  | { ok: true; attached_inspection_id: string | null }
  | { ok: false; outcome: "unauthenticated" | "not_found" | "not_shareable" | "removed" | "failed"; message: string };

/** Attach one of the seller's inspections (null detaches). */
export async function attachListingInspection(listingId: string, requestId: string | null): Promise<AttachInspectionResult> {
  const viewerId = await getCurrentSocialProfileId();
  if (!viewerId) return { ok: false, outcome: "unauthenticated", message: "Sign in to manage this listing." };
  const { data, error } = await createAdminClient().rpc("attach_listing_inspection", {
    p_actor_profile_id: viewerId,
    p_listing_id: listingId,
    p_request_id: requestId,
  });
  if (error || !data) {
    if (error?.code === "P0002") return { ok: false, outcome: "not_found", message: "Listing not found." };
    if (error?.message.includes("inspection_not_shareable")) {
      return { ok: false, outcome: "not_shareable", message: "You can only share an inspection you requested for this vehicle once it has been submitted." };
    }
    if (error?.message.includes("listing_removed")) return { ok: false, outcome: "removed", message: "This listing was removed." };
    console.warn("attach_listing_inspection failed", { code: error?.code, message: error?.message });
    return { ok: false, outcome: "failed", message: "The inspection could not be shared. Please try again." };
  }
  return { ok: true, attached_inspection_id: data.attached_inspection_id };
}
