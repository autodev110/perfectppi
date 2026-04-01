import { NextResponse } from "next/server";

// POST /api/webhooks/docuseal — DocuSeal webhook handler
// Receives signature completion events — updates contracts.signed_at
// IMPORTANT: Must verify webhook signature before processing
// TODO Phase D: implement signature verification + contract update
export async function POST() {
  return NextResponse.json({ received: true });
}
