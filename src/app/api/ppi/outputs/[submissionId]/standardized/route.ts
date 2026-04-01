import { NextResponse } from "next/server";

// GET /api/ppi/outputs/[submissionId]/standardized — get the current standardized output for a submission
// TODO Phase C: implement full logic
export async function GET() {
  return NextResponse.json({ message: "Phase C" }, { status: 501 });
}
