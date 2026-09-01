import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordTermsAcceptance } from "@/lib/legal/server";
import { TERMS_VERSION } from "@/lib/legal/constants";
import { z } from "zod";

const bodySchema = z.object({
  accepted: z.literal(true),
  source: z.enum(["ios_signup", "ios_oauth", "reauth"]).default("reauth"),
});

async function currentAccount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile) return { response: NextResponse.json({ error: "Profile not found" }, { status: 404 }) };
  return { supabase, profile };
}

export async function GET() {
  const account = await currentAccount();
  if ("response" in account) return account.response;

  const { data } = await account.supabase
    .from("legal_acceptances")
    .select("accepted_at")
    .eq("profile_id", account.profile.id)
    .eq("document_type", "terms")
    .eq("document_version", TERMS_VERSION)
    .maybeSingle();

  return NextResponse.json(
    { accepted: Boolean(data), version: TERMS_VERSION, acceptedAt: data?.accepted_at ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const account = await currentAccount();
  if ("response" in account) return account.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Explicit Terms acceptance is required" }, { status: 400 });
  }

  await recordTermsAcceptance({
    profileId: account.profile.id,
    source: parsed.data.source,
    headers: request.headers,
  });

  return NextResponse.json({ accepted: true, version: TERMS_VERSION }, { status: 201 });
}

