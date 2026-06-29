import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createSubmission } from "@/features/ppi/actions";

export async function GET(request: Request) {
  const auth = await requireApiRole(["consumer", "technician", "admin", "org_manager"]);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("request_id");

  if (!requestId) {
    return NextResponse.json(
      { error: "request_id is required" },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase
    .from("ppi_submissions")
    .select("*")
    .eq("ppi_request_id", requestId)
    .eq("is_current", true)
    .order("version", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiRole(["consumer", "technician"]);
  if ("response" in auth) return auth.response;

  const body = await request.json();

  if (!body.request_id) {
    return NextResponse.json({ error: "request_id is required" }, { status: 400 });
  }

  const result = await createSubmission(body.request_id, auth.profile.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: { submissionId: result.submissionId } }, { status: 201 });
}
