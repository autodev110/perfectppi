import { NextResponse } from "next/server";
import { z } from "zod";
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
    .from("organizations")
    .select("*")
    .eq("id", techProfile.organization_id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  logo_url: z.string().url().optional().or(z.literal("")),
});

export async function PATCH(request: Request) {
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

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase
    .from("organizations")
    .update(parsed.data)
    .eq("id", techProfile.organization_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
