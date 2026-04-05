import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const certification = searchParams.get("certification");
  const orgId = searchParams.get("org_id");

  const supabase = await createClient();

  let query = supabase
    .from("technician_profiles")
    .select(
      `
      *,
      profile:profiles!technician_profiles_profile_id_fkey(
        id, username, display_name, avatar_url, bio, is_public
      ),
      organization:organizations(id, name, slug, logo_url)
    `
    )
    .order("total_inspections", { ascending: false });

  if (certification) {
    query = query.eq("certification_level", certification as "none" | "ase" | "master" | "oem_qualified");
  }
  if (orgId) {
    query = query.eq("organization_id", orgId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
