import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("technician_profiles")
    .select(
      `
      *,
      profile:profiles!technician_profiles_profile_id_fkey!inner(
        id, username, display_name, avatar_url, bio, is_public
      ),
      organization:organizations(id, name, slug, logo_url)
    `
    )
    .eq("id", id)
    .eq("profile.is_public", true)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Technician not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}
