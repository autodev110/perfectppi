import Stripe from "stripe";

// Lazy singleton — only instantiated on first use, not at module load time
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-03-25.dahlia",
    });
  }
  return _stripe;
}

export function stripeIsConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}
