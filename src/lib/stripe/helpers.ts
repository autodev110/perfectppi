import type Stripe from "stripe";
import { getStripe } from "./client";

export interface CheckoutLineItem {
  name: string;
  description?: string;
  amountCents: number;
}

/**
 * Create a Stripe Checkout Session for a warranty payment.
 * Returns the checkout URL to redirect the user to.
 */
export async function createCheckoutSession(params: {
  lineItem: CheckoutLineItem;
  successUrl: string;
  cancelUrl: string;
  /** Stripe metadata forwarded to the payment_intent — use for webhook reconciliation */
  metadata: Record<string, string>;
  customerEmail?: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    customer_email: params.customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: params.lineItem.amountCents,
          product_data: {
            name: params.lineItem.name,
            ...(params.lineItem.description && {
              description: params.lineItem.description,
            }),
          },
        },
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
    payment_intent_data: {
      metadata: params.metadata,
    },
  });

  if (!session.url) {
    throw new Error("Stripe checkout session has no URL");
  }

  return { url: session.url, sessionId: session.id };
}

/**
 * Verify and construct a Stripe webhook event.
 * Always verify the signature before processing — never trust raw body alone.
 */
export function constructWebhookEvent(
  rawBody: Buffer,
  signature: string,
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  }
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}
