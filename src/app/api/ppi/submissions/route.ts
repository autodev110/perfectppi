import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createSubmission } from "@/features/ppi/actions";

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
