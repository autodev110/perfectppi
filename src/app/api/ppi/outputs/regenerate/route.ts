import { NextResponse } from "next/server";

// POST /api/ppi/outputs/regenerate — trigger output regeneration after edit+resubmit
// Inserts new standardized_outputs + vsc_outputs rows (INSERT-only, no updates)
// TODO Phase C: implement full logic
export async function POST() {
  return NextResponse.json({ message: "Phase C" }, { status: 501 });
}
