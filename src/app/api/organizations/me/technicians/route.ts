import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";

export async function GET() {
  const auth = await requireApiRole(["org_manager"]);
  if ("response" in auth) return auth.response;

  const { data: techProfile } = await auth.supabase
    .from("technician_profiles")
    .select("organization_id")
    .eq("profile_id", auth.profile.id)
    .single();

  if (!techProfile?.organization_id) {
    return NextResponse.json(
      { error: "No organization found" },
      { status: 404 }
    );
  }

  const { data, error } = await auth.supabase
    .from("technician_profiles")
    .select(
      `
      *,
      profile:profiles!technician_profiles_profile_id_fkey(
        id, username, display_name, avatar_url, bio
      )
    `
    )
    .eq("organization_id", techProfile.organization_id)
    .order("total_inspections", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
