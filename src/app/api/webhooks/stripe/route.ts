import { NextResponse } from "next/server";

// POST /api/webhooks/stripe — Stripe webhook handler
// IMPORTANT: Must verify Stripe-Signature header with constructEvent() before processing
// Idempotency: INSERT event into billing_events with UNIQUE on stripe_event_id — skip on 23505
// TODO Phase D: implement signature verification + event handling
export async function POST() {
  return NextResponse.json({ received: true });
}
