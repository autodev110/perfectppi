import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const requestSchema = z.object({
  requestType: z.enum([
    "access", "correction", "export", "deletion", "opt_out",
    "appeal", "authorized_agent", "other",
  ]),
  source: z.enum(["web", "ios"]).default("web"),
  details: z.string().trim().max(2000).optional(),
  deletionConfirmation: z.string().optional(),
});

async function currentProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile) return { response: NextResponse.json({ error: "Profile not found" }, { status: 404 }) };
  return { profile };
}

export async function GET() {
  const account = await currentProfile();
  if ("response" in account) return account.response;

  const { data, error } = await createAdminClient()
    .from("privacy_requests")
    .select("id, request_type, status, details, resolution_summary, submitted_at, updated_at, completed_at")
    .eq("profile_id", account.profile.id)
    .order("submitted_at", { ascending: false })
    .limit(25);

  if (error) return NextResponse.json({ error: "Could not load privacy requests" }, { status: 500 });
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const account = await currentProfile();
  if ("response" in account) return account.response;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }
  if (parsed.data.requestType === "deletion" && parsed.data.deletionConfirmation !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm the account deletion request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { count } = await admin
    .from("privacy_requests")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", account.profile.id)
    .in("status", ["submitted", "identity_verification", "in_progress"]);
  if ((count ?? 0) >= 5) {
    return NextResponse.json({ error: "You already have several open requests. Please wait for an update." }, { status: 429 });
  }

  const { data, error } = await admin
    .from("privacy_requests")
    .insert({
      profile_id: account.profile.id,
      request_type: parsed.data.requestType,
      source: parsed.data.source,
      details: parsed.data.details || null,
    })
    .select("id, request_type, status, details, resolution_summary, submitted_at, updated_at, completed_at")
    .single();

  if (error?.code === "23505") {
    return NextResponse.json({ error: "An account deletion request is already in progress" }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: "Could not submit the privacy request" }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

