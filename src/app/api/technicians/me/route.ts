import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getPublicCredentialMap } from "@/features/technicians/credentials";

export async function GET() {
  const auth = await requireApiRole(["technician", "org_manager"]);
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

  const credentials = await getPublicCredentialMap([data.id]);
  return NextResponse.json({ ...data, credentials: credentials.get(data.id) ?? [] });
}

const updateSchema = z.object({
  specialties: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  supported_makes: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  is_independent: z.boolean().optional(),
  service_area: z.string().trim().max(200).nullable().optional(),
  is_available: z.boolean().optional(),
  offers_mobile_service: z.boolean().optional(),
  offers_shop_service: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const auth = await requireApiRole(["technician", "org_manager"]);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON." }, { status: 400 });
  }
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
