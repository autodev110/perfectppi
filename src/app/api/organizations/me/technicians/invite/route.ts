import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { createAdminClient } from "@/lib/supabase/admin";

const inviteSchema = z.object({
  technicianProfileId: z.string().uuid(),
});

export async function POST(request: Request) {
  const auth = await requireApiRole(["org_manager"]);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { technicianProfileId } = parsed.data;

  const { data: myTechProfile } = await auth.supabase
    .from("technician_profiles")
    .select("organization_id")
    .eq("profile_id", auth.profile.id)
    .single();

  if (!myTechProfile?.organization_id) {
    return NextResponse.json(
      { error: "You are not associated with an organization" },
      { status: 400 },
    );
  }
  const orgId = myTechProfile.organization_id;

  const admin = createAdminClient();

  const { data: targetTech } = await admin
    .from("technician_profiles")
    .select("id, profile_id, organization_id, is_independent")
    .eq("id", technicianProfileId)
    .single();

  if (!targetTech) {
    return NextResponse.json({ error: "Technician not found" }, { status: 404 });
  }
  if (!targetTech.is_independent) {
    return NextResponse.json(
      { error: "This technician is already part of an organization" },
      { status: 409 },
    );
  }
  if (targetTech.organization_id) {
    return NextResponse.json(
      { error: "This technician is already linked to an organization" },
      { status: 409 },
    );
  }

  const { error: updateError } = await admin
    .from("technician_profiles")
    .update({ organization_id: orgId, is_independent: false })
    .eq("id", technicianProfileId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: memberError } = await admin
    .from("organization_memberships")
    .insert({
      technician_profile_id: technicianProfileId,
      organization_id: orgId,
      role: "technician",
    });

  if (memberError) {
    await admin
      .from("technician_profiles")
      .update({ organization_id: null, is_independent: true })
      .eq("id", technicianProfileId);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single();

  await admin.from("notifications").insert({
    user_id: targetTech.profile_id,
    type: "tech_request_accepted",
    title: "You joined an organization",
    body: `You have been added to ${org?.name ?? "an organization"}.`,
    data: { org_id: orgId },
  });

  return NextResponse.json({ success: true });
}
