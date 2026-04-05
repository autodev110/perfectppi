import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { submitPpi } from "@/features/ppi/actions";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiRole(["consumer", "technician"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  const result = await submitPpi(id);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error, missingAnswerIds: (result as { missingAnswerIds?: string[] }).missingAnswerIds },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, requestId: result.requestId });
}
