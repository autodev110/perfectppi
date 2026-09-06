import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";

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
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
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
    throw new Error("checkout.session.completed missing required metadata");
  }
  if (session.payment_status !== "paid") throw new Error("Checkout session is not paid");

  const admin = createAdminClient();

  // Idempotency: check current status before updating
  const { data: payment, error: paymentLookupError } = await admin
    .from("payments")
    .select("id, status, amount_cents, contract_id")
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentLookupError || !payment) throw new Error(`Payment ${paymentId} was not found`);
  if (payment.contract_id !== contractId) throw new Error("Stripe contract metadata mismatch");
  if (session.currency !== "usd" || session.amount_total !== payment.amount_cents) {
    throw new Error("Stripe amount or currency mismatch");
  }

  const { data: contract, error: contractError } = await admin
    .from("contracts")
    .select("warranty_order_id")
    .eq("id", contractId)
    .maybeSingle();
  if (contractError || !contract || contract.warranty_order_id !== warrantyOrderId) {
    throw new Error("Stripe order metadata mismatch");
  }

  if (payment.status === "completed") {
    console.log(`Payment ${paymentId} already completed — skipping`);
    return;
  }

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
  let receiptUrl: string | null = null;
  if (paymentIntentId) {
    const intent = await getStripe().paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    });
    const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
    receiptUrl = charge?.receipt_url ?? null;
  }

  const { error: completionError } = await admin.rpc("complete_warranty_payment", {
    p_payment_id: paymentId,
    p_contract_id: contractId,
    p_order_id: warrantyOrderId,
    p_stripe_payment_id: paymentIntentId,
    p_receipt_url: receiptUrl,
    p_paid_at: new Date().toISOString(),
  });
  if (completionError) throw completionError;

  console.log(`Stripe checkout ${session.id} → payment ${paymentId} completed, order ${warrantyOrderId} → paid`);
}

async function handlePaymentFailed(intent: Stripe.PaymentIntent) {
  const paymentId = intent.metadata?.payment_id;
  const contractId = intent.metadata?.contract_id;
  const warrantyOrderId = intent.metadata?.warranty_order_id;

  if (!paymentId || !contractId || !warrantyOrderId) {
    throw new Error("payment_intent.payment_failed missing required metadata");
  }

  const admin = createAdminClient();
  const { data: payment, error: paymentLookupError } = await admin
    .from("payments")
    .select("amount_cents, contract_id")
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentLookupError || !payment || payment.contract_id !== contractId) {
    throw new Error("Stripe failed-payment metadata mismatch");
  }
  if (intent.currency !== "usd" || intent.amount !== payment.amount_cents) {
    throw new Error("Stripe failed-payment amount or currency mismatch");
  }

  const { error } = await admin.rpc("fail_warranty_payment", {
    p_payment_id: paymentId,
    p_contract_id: contractId,
    p_order_id: warrantyOrderId,
    p_stripe_payment_id: intent.id,
  });
  if (error) throw error;

  console.log(`Stripe payment_intent.payment_failed → payment ${paymentId} failed`);
}
