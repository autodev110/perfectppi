import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";

/**
 * POST /api/webhooks/stripe
 *
 * Handles Stripe webhook events.
 * Signature verified with constructWebhookEvent() before any processing.
 * Idempotency: check existing payment status before updating.
 *
 * Events handled:
 *   checkout.session.completed — payment successful
 *   payment_intent.payment_failed — payment failed
 */
export async function POST(req: NextRequest) {
  const rawBody = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handleEvent(event);
  } catch (err: unknown) {
    console.error(`Stripe webhook error (${event.type}):`, err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "payment_intent.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
      break;
    default:
      console.log(`Unhandled Stripe event: ${event.type}`);
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata ?? {};
  const paymentId = metadata.payment_id;
  const contractId = metadata.contract_id;
  const warrantyOrderId = metadata.warranty_order_id;

  if (!paymentId || !contractId || !warrantyOrderId) {
    console.warn("Stripe checkout.session.completed missing metadata", metadata);
    return;
  }

  const admin = createAdminClient();

  // Idempotency: check current status before updating
  const { data: payment } = await admin
    .from("payments")
    .select("id, status")
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) {
    console.warn(`Stripe webhook: no payments row for id ${paymentId}`);
    return;
  }

  if (payment.status === "completed") {
    console.log(`Payment ${paymentId} already completed — skipping`);
    return;
  }

  // Update payment
  await admin
    .from("payments")
    .update({
      status: "completed",
      stripe_payment_id: session.payment_intent as string | null,
      receipt_url: session.invoice as string | null ?? null,
      paid_at: new Date().toISOString(),
    })
    .eq("id", paymentId);

  // Advance warranty order to paid
  await admin
    .from("warranty_orders")
    .update({ status: "paid" })
    .eq("id", warrantyOrderId);

  console.log(`Stripe checkout ${session.id} → payment ${paymentId} completed, order ${warrantyOrderId} → paid`);
}

async function handlePaymentFailed(intent: Stripe.PaymentIntent) {
  const paymentId = intent.metadata?.payment_id;
  const warrantyOrderId = intent.metadata?.warranty_order_id;

  if (!paymentId) return;

  const admin = createAdminClient();

  await admin
    .from("payments")
    .update({ status: "failed" })
    .eq("id", paymentId);

  if (warrantyOrderId) {
    await admin
      .from("warranty_orders")
      .update({ status: "failed" })
      .eq("id", warrantyOrderId);
  }

  console.log(`Stripe payment_intent.payment_failed → payment ${paymentId} failed`);
}
