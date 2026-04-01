import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";

export async function GET() {
  const auth = await requireApiRole(["technician"]);
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.supabase
    .from("technician_profiles")
    .select(
      `
      *,
      organization:organizations(id, name, slug, logo_url)
    `
    )
    .eq("profile_id", auth.profile.id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Technician profile not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

const updateSchema = z.object({
  specialties: z.array(z.string()).optional(),
  certification_level: z
    .enum(["none", "ase", "master", "oem_qualified"])
    .optional(),
  is_independent: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const auth = await requireApiRole(["technician"]);
  if ("response" in auth) return auth.response;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase
    .from("technician_profiles")
    .update(parsed.data)
    .eq("profile_id", auth.profile.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
