"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { createSubmission, getSubmission, getSubmitter, docusealIsConfigured } from "@/lib/docuseal/client";
import { createCheckoutSession } from "@/lib/stripe/helpers";
import { stripeIsConfigured } from "@/lib/stripe/client";
import type { VscCoverageData } from "@/types/api";
import type { WarrantyPlan } from "./queries";

// ============================================================================
// Helpers
// ============================================================================

async function getAuthProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();

  return profile ? { ...profile, userId: user.id, supabase } : null;
}

/** Generate warranty plan options from VSC coverage data */
function buildPlansFromCoverage(coverage: VscCoverageData): WarrantyPlan[] {
  if (coverage.overall_eligibility === "ineligible") return [];

  const isConditional = coverage.overall_eligibility === "conditional";

  const coveredComponents = coverage.components
    .filter((c) => c.determination === "covered")
    .map((c) => c.component);

  const excludedComponents = coverage.components
    .filter((c) => c.determination === "excluded")
    .map((c) => c.component);

  if (isConditional) {
    return [
      {
        name: "Conditional Coverage",
        term_years: 1,
        term_miles: 12000,
        price_cents: 79900,
        inclusions: coveredComponents.slice(0, 8),
        exclusions: excludedComponents.slice(0, 5),
        deductible_cents: 10000,
      },
      {
        name: "Extended Conditional",
        term_years: 2,
        term_miles: 24000,
        price_cents: 139900,
        inclusions: coveredComponents.slice(0, 8),
        exclusions: excludedComponents.slice(0, 5),
        deductible_cents: 10000,
      },
    ];
  }

  return [
    {
      name: "Basic Coverage",
      term_years: 1,
      term_miles: 12000,
      price_cents: 59900,
      inclusions: coveredComponents.slice(0, 6),
      exclusions: excludedComponents.slice(0, 4),
      deductible_cents: 10000,
    },
    {
      name: "Standard Coverage",
      term_years: 2,
      term_miles: 24000,
      price_cents: 99900,
      inclusions: coveredComponents.slice(0, 10),
      exclusions: excludedComponents.slice(0, 3),
      deductible_cents: 7500,
    },
    {
      name: "Premium Coverage",
      term_years: 3,
      term_miles: 36000,
      price_cents: 149900,
      inclusions: coveredComponents,
      exclusions: excludedComponents.slice(0, 2),
      deductible_cents: 5000,
    },
  ];
}

// ============================================================================
// generateWarrantyOffer
// Called after VSC generation — creates warranty_options row
// Idempotent: returns existing row if already created for this VSC output
// ============================================================================

export async function generateWarrantyOffer(
  vscOutputId: string,
): Promise<{ warrantyOptionId: string } | { error: string }> {
  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };

  const supabase = auth.supabase;
  const admin = createAdminClient();

  // Check if already exists
  const { data: existing } = await supabase
    .from("warranty_options")
    .select("id")
    .eq("vsc_output_id", vscOutputId)
    .maybeSingle();

  if (existing) return { warrantyOptionId: existing.id };

  // Fetch VSC output
  const { data: vscOutput, error: vscErr } = await supabase
    .from("vsc_outputs")
    .select("id, coverage_data, ppi_submission_id")
    .eq("id", vscOutputId)
    .single();

  if (vscErr || !vscOutput) return { error: "VSC output not found" };

  const coverage = vscOutput.coverage_data as unknown as VscCoverageData;
  if (coverage.overall_eligibility === "ineligible") {
    return { error: "Vehicle is not eligible for VSC coverage" };
  }

  // Get vehicle from the PPI submission chain
  const { data: submission } = await supabase
    .from("ppi_submissions")
    .select("ppi_request_id")
    .eq("id", vscOutput.ppi_submission_id)
    .single();

  const { data: request } = submission
    ? await supabase
        .from("ppi_requests")
        .select("vehicle_id")
        .eq("id", submission.ppi_request_id)
        .single()
    : { data: null };

  if (!request?.vehicle_id) return { error: "Vehicle not found" };

  const plans = buildPlansFromCoverage(coverage);

  const { data: option, error: insertErr } = await admin
    .from("warranty_options")
    .insert({
      vsc_output_id: vscOutputId,
      vehicle_id: request.vehicle_id,
      user_id: auth.id,
      plans: plans as unknown as never[],
      status: "offered",
      offered_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !option) return { error: "Failed to create warranty offer" };

  revalidatePath(`/dashboard/ppi`);
  return { warrantyOptionId: option.id };
}

// ============================================================================
// markWarrantyViewed — called on first view of the offer
// ============================================================================

export async function markWarrantyViewed(
  warrantyOptionId: string,
): Promise<void> {
  const auth = await getAuthProfile();
  if (!auth) return;

  const supabase = auth.supabase;

  const { data: opt } = await supabase
    .from("warranty_options")
    .select("status, viewed_at")
    .eq("id", warrantyOptionId)
    .single();

  if (opt && opt.status === "offered" && !opt.viewed_at) {
    await supabase
      .from("warranty_options")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", warrantyOptionId);
  }
}

// ============================================================================
// selectPlan — consumer picks a plan, creates warranty_orders row
// ============================================================================

export async function selectPlan(
  warrantyOptionId: string,
  planIndex: number,
): Promise<{ orderId: string } | { error: string }> {
  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };

  const supabase = auth.supabase;
  const admin = createAdminClient();

  // Fetch option + verify ownership
  const { data: option, error: optErr } = await supabase
    .from("warranty_options")
    .select("*")
    .eq("id", warrantyOptionId)
    .single();

  if (optErr || !option) return { error: "Warranty option not found" };
  if (option.user_id !== auth.id) return { error: "Not authorized" };
  if (option.status === "selected" || option.status === "contract_pending" || option.status === "signed" || option.status === "payment_pending" || option.status === "paid") {
    return { error: "Plan already selected" };
  }

  const plans = (option.plans as unknown as WarrantyPlan[]) ?? [];
  const plan = plans[planIndex];
  if (!plan) return { error: "Invalid plan selection" };

  // Create order
  const { data: order, error: orderErr } = await admin
    .from("warranty_orders")
    .insert({
      warranty_option_id: warrantyOptionId,
      plan_name: plan.name,
      term_years: plan.term_years,
      term_miles: plan.term_miles ?? null,
      price_cents: plan.price_cents,
      status: "contract_pending",
      selected_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (orderErr || !order) return { error: "Failed to create warranty order" };

  // Advance option status
  await supabase
    .from("warranty_options")
    .update({ status: "selected" })
    .eq("id", warrantyOptionId);

  revalidatePath(`/dashboard/warranty/${warrantyOptionId}`);
  return { orderId: order.id };
}

// ============================================================================
// presentContract — create DocuSeal submission, insert contracts row
// Called when user reaches the signing step
// ============================================================================

export async function presentContract(
  orderId: string,
): Promise<{ contractId: string } | { error: string }> {
  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };

  const supabase = auth.supabase;
  const admin = createAdminClient();

  // Verify order exists
  const { data: order, error: orderErr } = await supabase
    .from("warranty_orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) return { error: "Order not found" };

  // Verify ownership via the warranty option
  const { data: optionCheck } = await supabase
    .from("warranty_options")
    .select("user_id, vehicle_id")
    .eq("id", order.warranty_option_id)
    .single();

  if (!optionCheck || optionCheck.user_id !== auth.id) return { error: "Not authorized" };

  // Check if contract already exists
  const { data: existing } = await supabase
    .from("contracts")
    .select("id")
    .eq("warranty_order_id", orderId)
    .maybeSingle();
  if (existing) return { contractId: existing.id };

  // Get user's email + display name for DocuSeal
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", auth.id)
    .single();

  const { data: authUser } = await supabase.auth.getUser();
  const customerEmail = authUser?.user?.email ?? "";
  const customerName = profile?.display_name ?? "Customer";

  // Get vehicle info for pre-filling template
  const vehicleId = optionCheck.vehicle_id;
  const { data: vehicle } = vehicleId
    ? await supabase
        .from("vehicles")
        .select("year, make, model, trim, vin, mileage")
        .eq("id", vehicleId)
        .single()
    : { data: null };

  const docusealEnabled = docusealIsConfigured();
  const templateIdRaw = process.env.DOCUSEAL_WARRANTY_TEMPLATE_ID;

  // If API key exists but template is missing, fail loudly instead of silently auto-signing.
  if (docusealEnabled && !templateIdRaw) {
    return { error: "DOCUSEAL_WARRANTY_TEMPLATE_ID is missing." };
  }

  let docusealId: string | null = null;
  let submitterSlug: string | null = null;

  if (docusealEnabled && templateIdRaw) {
    const templateId = Number.parseInt(templateIdRaw, 10);
    if (Number.isNaN(templateId)) {
      return { error: "DOCUSEAL_WARRANTY_TEMPLATE_ID must be a number." };
    }

    try {
      const configuredRole = process.env.DOCUSEAL_CUSTOMER_ROLE?.trim();
      const roleCandidates = Array.from(
        new Set([configuredRole, "Customer", "First Party"].filter(Boolean) as string[]),
      );

      const values: Record<string, string> = {
        plan_name: order.plan_name,
        term: `${order.term_years} year${order.term_years > 1 ? "s" : ""}${order.term_miles ? ` / ${order.term_miles.toLocaleString()} miles` : ""}`,
        price: `$${(order.price_cents / 100).toFixed(2)}`,
        customer_name: customerName,
        vehicle: vehicle
          ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
              .filter(Boolean)
              .join(" ")
          : "",
        vin: vehicle?.vin ?? "",
        mileage: vehicle?.mileage ? vehicle.mileage.toLocaleString() : "",
      };

      let submitters: Awaited<ReturnType<typeof createSubmission>> | null = null;
      let lastRoleError: unknown = null;
      for (const role of roleCandidates) {
        try {
          submitters = await createSubmission({
            templateId,
            customerEmail,
            customerName,
            customerRole: role,
            values,
          });
          break;
        } catch (roleErr) {
          lastRoleError = roleErr;
          const message = roleErr instanceof Error ? roleErr.message : String(roleErr);
          if (!message.includes("Unknown submitter role")) {
            throw roleErr;
          }
        }
      }

      if (!submitters) {
        throw (lastRoleError ?? new Error("DocuSeal role negotiation failed"));
      }

      const customerSubmitter =
        submitters.find((s) => roleCandidates.includes(s.role)) ?? submitters[0];
      if (!customerSubmitter) {
        return {
          error:
            "DocuSeal template has no submitter roles available.",
        };
      }

      const submissionId = (customerSubmitter as { submission_id?: number }).submission_id;
      // Webhook events are keyed by DocuSeal submission ID.
      docusealId = String(submissionId ?? customerSubmitter.id);
      submitterSlug = customerSubmitter.slug;
    } catch (err) {
      console.error("DocuSeal submission failed:", err);
      return {
        error:
          err instanceof Error
            ? `DocuSeal submission failed: ${err.message}`
            : "DocuSeal submission failed.",
      };
    }
  }

  const { data: contract, error: contractErr } = await admin
    .from("contracts")
    .insert({
      warranty_order_id: orderId,
      signer_id: auth.id,
      docuseal_id: docusealId,
      docuseal_submitter_slug: submitterSlug,
      presented_at: new Date().toISOString(),
      // In local/dev without DocuSeal configured, auto-sign immediately.
      signed_at: docusealEnabled ? null : new Date().toISOString(),
    })
    .select("id")
    .single();

  if (contractErr || !contract) return { error: "Failed to create contract" };

  // If DocuSeal is not configured at all, advance order to signed immediately.
  if (!docusealEnabled) {
    await admin
      .from("warranty_orders")
      .update({ status: "signed" })
      .eq("id", orderId);
  }

  revalidatePath(`/dashboard/warranty`);
  return { contractId: contract.id };
}

// ============================================================================
// getContractSigningUrl — generate fresh DocuSeal embed_src on page open
// IMPORTANT: embed_src expires — always call this on page load, never store it
// ============================================================================

export async function getContractSigningUrl(
  contractId: string,
): Promise<{ embedSrc: string } | { error: string }> {
  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };

  const supabase = auth.supabase;

  const { data: contract, error: err } = await supabase
    .from("contracts")
    .select("id, docuseal_submitter_slug, signed_at, signer_id")
    .eq("id", contractId)
    .single();

  if (err || !contract) return { error: "Contract not found" };
  if (contract.signer_id !== auth.id) return { error: "Not authorized" };
  if (contract.signed_at) return { error: "Already signed" };

  const slug = (contract as { docuseal_submitter_slug: string | null }).docuseal_submitter_slug;
  if (!slug) return { error: "No DocuSeal submitter for this contract" };

  try {
    const submitter = await getSubmitter(slug);
    if (!submitter.embed_src) return { error: "DocuSeal embed URL unavailable" };
    return { embedSrc: submitter.embed_src };
  } catch (e) {
    console.error("Failed to get DocuSeal embed_src:", e);
    return { error: "Failed to load signing URL" };
  }
}

// ============================================================================
// syncContractSignatureStatus
// Manual fallback for local/dev when webhook cannot reach localhost.
// Checks DocuSeal submission status and advances contract/order if completed.
// ============================================================================

export async function syncContractSignatureStatus(
  contractId: string,
): Promise<{ signed: boolean } | { error: string }> {
  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };

  const supabase = auth.supabase;
  const admin = createAdminClient();

  const { data: contract, error } = await supabase
    .from("contracts")
    .select("id, signer_id, signed_at, warranty_order_id, docuseal_id")
    .eq("id", contractId)
    .single();

  if (error || !contract) return { error: "Contract not found" };
  if (contract.signer_id !== auth.id) return { error: "Not authorized" };
  if (contract.signed_at) return { signed: true };
  if (!contract.docuseal_id) return { signed: false };

  const submissionId = Number.parseInt(contract.docuseal_id, 10);
  if (Number.isNaN(submissionId)) {
    return { error: "Invalid DocuSeal submission reference." };
  }

  try {
    const submission = await getSubmission(submissionId);
    const submitters = Array.isArray(submission.submitters) ? submission.submitters : [];
    const allCompleted =
      submission.status === "completed" ||
      (submitters.length > 0 && submitters.every((s) => !!s.completed_at));

    if (!allCompleted) {
      return { signed: false };
    }

    const signedAt = new Date().toISOString();

    await admin
      .from("contracts")
      .update({ signed_at: signedAt })
      .eq("id", contract.id)
      .is("signed_at", null);

    await admin
      .from("warranty_orders")
      .update({ status: "signed" })
      .eq("id", contract.warranty_order_id);

    revalidatePath(`/dashboard/warranty/${contract.warranty_order_id}`);
    revalidatePath(`/dashboard/warranty`);

    return { signed: true };
  } catch (e) {
    console.error("DocuSeal signature sync failed:", e);
    return {
      error:
        e instanceof Error
          ? `Signature sync failed: ${e.message}`
          : "Signature sync failed.",
    };
  }
}

// ============================================================================
// initiatePayment — create Stripe Checkout session, insert payments row
// ============================================================================

export async function initiatePayment(
  contractId: string,
): Promise<{ checkoutUrl: string } | { error: string }> {
  const auth = await getAuthProfile();
  if (!auth) return { error: "Not authenticated" };

  const supabase = auth.supabase;
  const admin = createAdminClient();

  // Verify contract is signed
  const { data: contract, error: cErr } = await supabase
    .from("contracts")
    .select("id, signed_at, signer_id, warranty_order_id")
    .eq("id", contractId)
    .single();

  if (cErr || !contract) return { error: "Contract not found" };
  if (contract.signer_id !== auth.id) return { error: "Not authorized" };
  if (!contract.signed_at) return { error: "Contract must be signed before payment" };

  // Check for existing payment
  const { data: existingPayment } = await supabase
    .from("payments")
    .select("id, status, stripe_payment_id")
    .eq("contract_id", contractId)
    .maybeSingle();

  if (existingPayment?.status === "completed") return { error: "Already paid" };

  // Get order details for price
  const { data: order, error: orderErr } = await supabase
    .from("warranty_orders")
    .select("plan_name, price_cents, term_years, term_miles, warranty_option_id")
    .eq("id", contract.warranty_order_id)
    .single();

  if (orderErr || !order) return { error: "Order not found" };

  // Get user email for Stripe
  const { data: authUser } = await supabase.auth.getUser();
  const customerEmail = authUser?.user?.email ?? undefined;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  // Redirect back to the warranty option page with payment=success so the receipt step shows
  const successUrl = `${siteUrl}/dashboard/warranty/${order.warranty_option_id}?payment=success`;
  const cancelUrl = `${siteUrl}/dashboard/warranty/${order.warranty_option_id}`;

  // Create payment row first (pending)
  let paymentId: string;
  if (existingPayment) {
    paymentId = existingPayment.id;
  } else {
    const { data: payment, error: pErr } = await admin
      .from("payments")
      .insert({
        contract_id: contractId,
        user_id: auth.id,
        amount_cents: order.price_cents,
        method: "card",
        status: "pending",
      })
      .select("id")
      .single();

    if (pErr || !payment) return { error: "Failed to create payment record" };
    paymentId = payment.id;
  }

  if (!stripeIsConfigured()) {
    // Dev mode — mark paid immediately without Stripe
    await admin
      .from("payments")
      .update({
        status: "completed",
        paid_at: new Date().toISOString(),
        receipt_url: `${siteUrl}/dashboard/warranty/${order.warranty_option_id}?payment=success`,
      })
      .eq("id", paymentId);

    await admin
      .from("warranty_orders")
      .update({ status: "paid" })
      .eq("id", contract.warranty_order_id);

    return { checkoutUrl: successUrl };
  }

  try {
    const term = `${order.term_years}yr${order.term_miles ? ` / ${order.term_miles.toLocaleString()}mi` : ""}`;
    const { url } = await createCheckoutSession({
      lineItem: {
        name: order.plan_name,
        description: `Vehicle Service Contract — ${term}`,
        amountCents: order.price_cents,
      },
      successUrl,
      cancelUrl,
      metadata: {
        payment_id: paymentId,
        contract_id: contractId,
        warranty_order_id: contract.warranty_order_id,
      },
      customerEmail,
    });

    // Advance order status to payment_pending
    await admin
      .from("warranty_orders")
      .update({ status: "payment_pending" })
      .eq("id", contract.warranty_order_id);

    return { checkoutUrl: url };
  } catch (e) {
    console.error("Stripe checkout failed:", e);
    return { error: "Failed to create payment session" };
  }
}
