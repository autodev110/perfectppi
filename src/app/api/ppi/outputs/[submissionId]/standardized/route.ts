import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getStandardizedOutput } from "@/features/outputs/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician", "admin"]);
  if ("response" in auth) return auth.response;

  const { submissionId } = await params;
  const output = await getStandardizedOutput(submissionId);

  if (!output) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: output });
}
