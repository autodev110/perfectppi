"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/features/auth/guards";
import { revalidatePath } from "next/cache";

export async function inviteTechnicianToOrg(techProfileId: string) {
  const profile = await requireRole(["org_manager"]);

  const supabase = await createClient();

  // Get manager's org
  const { data: myTechProfile } = await supabase
    .from("technician_profiles")
    .select("organization_id")
    .eq("profile_id", profile.id)
    .single();

  if (!myTechProfile?.organization_id) {
    return { error: "You are not associated with an organization" };
  }

  const orgId = myTechProfile.organization_id;

  // Verify target tech is independent (not already in an org)
  const { data: targetTech } = await supabase
    .from("technician_profiles")
    .select("id, profile_id, organization_id, is_independent")
    .eq("id", techProfileId)
    .single();

  if (!targetTech) return { error: "Technician not found" };
  if (!targetTech.is_independent) {
    return { error: "This technician is already part of an organization" };
  }

  // Link tech to org
  const { error: updateError } = await supabase
    .from("technician_profiles")
    .update({ organization_id: orgId, is_independent: false })
    .eq("id", techProfileId);

  if (updateError) return { error: updateError.message };

  // Create membership row
  const { error: memberError } = await supabase
    .from("organization_memberships")
    .insert({
      technician_profile_id: techProfileId,
      organization_id: orgId,
      role: "technician",
    });

  if (memberError) return { error: memberError.message };

  // Notify the technician (service role — cross-user write)
  const adminClient = createAdminClient();
  const { data: org } = await adminClient
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  await adminClient.from("notifications").insert({
    user_id: targetTech.profile_id,
    type: "tech_request_accepted",
    title: "You joined an organization",
    body: `You have been added to ${org?.name ?? "an organization"}.`,
    data: { org_id: orgId },
  });

  revalidatePath("/org/technicians");
  return { success: true };
}

export async function removeTechnicianFromOrg(techProfileId: string, _formData?: FormData) {
  void _formData;
  const profile = await requireRole(["org_manager"]);

  const supabase = await createClient();

  const { data: myTechProfile } = await supabase
    .from("technician_profiles")
    .select("organization_id")
    .eq("profile_id", profile.id)
    .single();

  if (!myTechProfile?.organization_id) {
    throw new Error("You are not associated with an organization");
  }

  const orgId = myTechProfile.organization_id;

  // Delete membership row
  const { error: deleteError } = await supabase
    .from("organization_memberships")
    .delete()
    .eq("technician_profile_id", techProfileId)
    .eq("organization_id", orgId)
    .eq("role", "technician");

  if (deleteError) {
    throw new Error(`Failed to remove organization membership: ${deleteError.message}`);
  }

  // Unlink tech from org
  const { error: updateError } = await supabase
    .from("technician_profiles")
    .update({ organization_id: null, is_independent: true })
    .eq("id", techProfileId)
    .eq("organization_id", orgId);

  if (updateError) {
    throw new Error(`Failed to unlink technician from organization: ${updateError.message}`);
  }

  revalidatePath("/org/technicians");
}

export async function leaveTechOrganization(_formData?: FormData) {
  void _formData;
  const profile = await requireRole(["technician"]);

  const supabase = await createClient();

  const { data: techProfile } = await supabase
    .from("technician_profiles")
    .select("id, organization_id")
    .eq("profile_id", profile.id)
    .single();

  if (!techProfile?.organization_id) {
    throw new Error("You are not in an organization");
  }

  // Delete membership row
  const { error: deleteError } = await supabase
    .from("organization_memberships")
    .delete()
    .eq("technician_profile_id", techProfile.id)
    .eq("role", "technician");

  if (deleteError) {
    throw new Error(`Failed to remove organization membership: ${deleteError.message}`);
  }

  // Clear org from tech profile
  const { error: updateError } = await supabase
    .from("technician_profiles")
    .update({ organization_id: null, is_independent: true })
    .eq("id", techProfile.id);

  if (updateError) {
    throw new Error(`Failed to leave organization: ${updateError.message}`);
  }

  revalidatePath("/tech/organization");
}
