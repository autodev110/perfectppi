import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildAccountDataExport } from "@/lib/privacy/export";
import {
  privacyRecordExpiry,
  privacyRequestSource,
  privacySubjectReference,
} from "@/lib/privacy/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  try {
    const data = await buildAccountDataExport(profile.id, user);
    const completedAt = new Date().toISOString();
    const { error } = await createAdminClient().from("privacy_requests").insert({
      profile_id: profile.id,
      auth_user_id: user.id,
      subject_reference_hash: privacySubjectReference(user.id),
      request_type: "export",
      source: privacyRequestSource(request),
      status: "completed",
      acknowledged_at: completedAt,
      completed_at: completedAt,
      resolution_summary: "Account data export delivered to the authenticated account holder.",
      retention_expires_at: privacyRecordExpiry(),
    });
    if (error) throw new Error(error.message);

    const date = completedAt.slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Cache-Control": "no-store, private",
        "Content-Disposition": `attachment; filename="perfectppi-account-export-${date}.json"`,
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("account export failed", error);
    return NextResponse.json({ error: "Account data could not be exported" }, { status: 500 });
  }
}
