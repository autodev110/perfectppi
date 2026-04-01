import { NextResponse } from "next/server";

// POST /api/ppi/submissions/[id]/submit — finalize and submit a PPI submission
// Transitions status to 'submitted', triggers on-ppi-submitted Edge Function
// TODO Phase B: implement full logic
export async function POST() {
  return NextResponse.json({ message: "Phase B" }, { status: 501 });
}
