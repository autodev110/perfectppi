"use client";

import { useState, useEffect, useCallback } from "react";
import { useWarrantyFlow } from "@/features/warranty/hooks";
import type { FullWarrantyFlow, WarrantyPlan } from "@/features/warranty/queries";
import { Shield, Check, ChevronRight, FileText, CreditCard, CheckCircle, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

// ============================================================================
// Step indicator
// ============================================================================

const STEPS = ["Offer", "Select Plan", "Sign Contract", "Payment", "Receipt"] as const;

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < currentStep
                  ? "bg-primary-container text-white"
                  : i === currentStep
                  ? "bg-primary-container text-white ring-2 ring-primary-container ring-offset-2"
                  : "bg-surface-container text-on-surface-variant"
              }`}
            >
              {i < currentStep ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={`text-[10px] font-semibold hidden sm:block ${
                i <= currentStep ? "text-on-surface" : "text-on-surface-variant"
              }`}
            >
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`h-0.5 w-8 sm:w-12 mx-1 mb-4 sm:mb-0 transition-colors ${
                i < currentStep ? "bg-primary-container" : "bg-surface-container"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Plan card
// ============================================================================

function PlanCard({
  plan,
  index,
  selected,
  onSelect,
  isPending,
}: {
  plan: WarrantyPlan;
  index: number;
  selected: boolean;
  onSelect: (i: number) => void;
  isPending: boolean;
}) {
  const term = `${plan.term_years} Year${plan.term_years > 1 ? "s" : ""}${
    plan.term_miles ? ` / ${plan.term_miles.toLocaleString()} Miles` : ""
  }`;
  const price = (plan.price_cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const deductible = (plan.deductible_cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  return (
    <div
      className={`relative rounded-xl border-2 p-5 cursor-pointer transition-all ${
        selected
          ? "border-primary-container bg-primary-container/5"
          : "border-outline-variant/20 bg-surface-container-lowest hover:border-outline-variant/50"
      }`}
      onClick={() => !isPending && onSelect(index)}
    >
      {selected && (
        <div className="absolute top-3 right-3 bg-primary-container text-white rounded-full p-0.5">
          <Check className="h-3.5 w-3.5" />
        </div>
      )}
      <div className="mb-3">
        <h3 className="font-bold text-on-surface text-base">{plan.name}</h3>
        <p className="text-xs text-on-surface-variant mt-0.5">{term}</p>
      </div>

      <div className="flex items-end gap-1 mb-4">
        <span className="text-2xl font-black text-on-surface">{price}</span>
        <span className="text-xs text-on-surface-variant mb-1">one-time</span>
      </div>

      <div className="text-xs text-on-surface-variant mb-1">
        Deductible: <span className="font-semibold text-on-surface">{deductible}</span>
      </div>

      {plan.inclusions.length > 0 && (
        <ul className="mt-3 space-y-1">
          {plan.inclusions.slice(0, 5).map((item) => (
            <li key={item} className="flex items-center gap-1.5 text-xs text-on-surface">
              <Check className="h-3 w-3 text-emerald-600 shrink-0" />
              {item}
            </li>
          ))}
          {plan.inclusions.length > 5 && (
            <li className="text-xs text-on-surface-variant">
              +{plan.inclusions.length - 5} more covered
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ============================================================================
// DocuSeal embed
// ============================================================================

function DocuSealEmbed({
  contractId,
  onSigned,
  getSigningUrl,
}: {
  contractId: string;
  onSigned: () => void;
  getSigningUrl: (id: string) => Promise<string | null>;
}) {
  const [embedSrc, setEmbedSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const url = await getSigningUrl(contractId);
      if (!mounted) return;
      if (url === "__SIGNED_ALREADY__") {
        onSigned();
        setLoading(false);
        return;
      }
      if (!url) {
        setError("Failed to load signing URL. Please try again.");
      } else {
        setEmbedSrc(url);
      }
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, [contractId, getSigningUrl]);

  // Listen for DocuSeal completion postMessage
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (
        e.data?.type === "docuseal:completed" ||
        e.data === "docuseal:completed"
      ) {
        onSigned();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onSigned]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-surface-container rounded-xl">
        <Loader2 className="h-6 w-6 animate-spin text-on-surface-variant" />
      </div>
    );
  }

  if (error || !embedSrc) {
    return (
      <div className="flex flex-col items-center justify-center h-40 bg-surface-container rounded-xl gap-3">
        <AlertCircle className="h-6 w-6 text-red-500" />
        <p className="text-sm text-on-surface-variant">{error ?? "Could not load contract"}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-outline-variant/20">
      <iframe
        src={embedSrc}
        className="w-full min-h-[600px]"
        allow="camera; microphone"
        title="Contract Signing"
      />
    </div>
  );
}

// ============================================================================
// Main client component
// ============================================================================

export function WarrantyFlowClient({
  flow,
  vehicleName,
  paymentCallback,
}: {
  flow: FullWarrantyFlow;
  vehicleName: string;
  paymentCallback: string | null;
}) {
  const { option, order, contract, payment } = flow;
  const {
    isPending,
    error,
    clearError,
    handleSelectPlan,
    handlePresentContract,
    handleGetSigningUrl,
    handleInitiatePayment,
    handleMarkViewed,
  } = useWarrantyFlow(option.id);

  const [selectedPlanIndex, setSelectedPlanIndex] = useState<number | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(order?.id ?? null);
  const [currentContractId, setCurrentContractId] = useState<string | null>(contract?.id ?? null);
  const [contractSigned, setContractSigned] = useState(
    !!contract?.signed_at || (!!contract && !contract.docuseal_submitter_slug),
  );
  const [paymentComplete, setPaymentComplete] = useState(
    payment?.status === "completed" || paymentCallback === "success",
  );

  // Determine current step from DB state
  function computeStep(): number {
    if (paymentComplete || payment?.status === "completed") return 4;
    if (currentContractId && contractSigned) return 3;
    if (currentContractId) return 2;
    // Plan selected but contract not created yet: stay on select-plan step
    // so user can click "Proceed to Contract".
    if (currentOrderId) return 1;
    return 0;
  }

  const currentStep = computeStep();

  // Mark warranty as viewed on mount
  useEffect(() => {
    handleMarkViewed();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSelectPlan(index: number) {
    setSelectedPlanIndex(index);
    const orderId = await handleSelectPlan(index);
    if (orderId) {
      setCurrentOrderId(orderId);
    }
  }

  async function onProceedToContract() {
    if (!currentOrderId) return;
    const contractId = await handlePresentContract(currentOrderId);
    if (contractId) {
      setCurrentContractId(contractId);
    }
  }

  const handleSigned = useCallback(() => {
    setContractSigned(true);
  }, []);

  async function onProceedToPayment() {
    if (!currentContractId) return;
    const checkoutUrl = await handleInitiatePayment(currentContractId);
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    }
  }

  const selectedPlan = option.plans[selectedPlanIndex ?? -1] ?? (currentOrderId ? {
    name: order?.plan_name ?? "",
    term_years: order?.term_years ?? 0,
    term_miles: order?.term_miles ?? null,
    price_cents: order?.price_cents ?? 0,
    inclusions: [],
    exclusions: [],
    deductible_cents: 0,
  } : null);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-5 w-5 text-primary-container" />
          <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
            Vehicle Service Contract
          </span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">
          {vehicleName}
        </h1>
      </div>

      <StepIndicator currentStep={currentStep} />

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-sm text-red-700 border border-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={clearError} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}

      {/* ── Step 0/1: Plan Selection ── */}
      {currentStep <= 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="font-bold text-on-surface text-lg mb-1">Choose Your Plan</h2>
            <p className="text-sm text-on-surface-variant">
              Select the coverage that fits your needs. All plans are subject to contract terms.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {option.plans.map((plan, i) => (
              <PlanCard
                key={plan.name}
                plan={plan}
                index={i}
                selected={selectedPlanIndex === i}
                onSelect={onSelectPlan}
                isPending={isPending}
              />
            ))}
          </div>

          {currentOrderId && (
            <div className="pt-2">
              <Button
                onClick={onProceedToContract}
                disabled={isPending}
                className="bg-primary-container text-white hover:bg-primary-container/90 rounded-xl px-6"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Proceed to Contract
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Sign Contract ── */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary-container" />
            <h2 className="font-bold text-on-surface text-lg">Review & Sign Contract</h2>
          </div>

          {selectedPlan && (
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-4 text-sm">
              <p className="font-semibold text-on-surface">{selectedPlan.name}</p>
              <p className="text-on-surface-variant text-xs mt-0.5">
                {selectedPlan.term_years}yr
                {selectedPlan.term_miles ? ` / ${selectedPlan.term_miles.toLocaleString()}mi` : ""} &middot;{" "}
                {(selectedPlan.price_cents / 100).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}
              </p>
            </div>
          )}

          <p className="text-sm text-on-surface-variant">
            Please read the contract carefully. Payment will only be requested after you have
            signed the document below.
          </p>

          {currentContractId && !contractSigned && (
            <DocuSealEmbed
              contractId={currentContractId}
              onSigned={handleSigned}
              getSigningUrl={handleGetSigningUrl}
            />
          )}

          {contractSigned && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg text-sm text-emerald-700 border border-emerald-200">
                <CheckCircle className="h-4 w-4" />
                Contract signed successfully!
              </div>
              <Button
                onClick={onProceedToPayment}
                disabled={isPending}
                className="bg-primary-container text-white hover:bg-primary-container/90 rounded-xl px-6"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                <CreditCard className="h-4 w-4 mr-2" />
                Proceed to Payment
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Payment (Stripe redirect in progress) ── */}
      {currentStep === 3 && !paymentComplete && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary-container" />
            <h2 className="font-bold text-on-surface text-lg">Complete Payment</h2>
          </div>
          <p className="text-sm text-on-surface-variant">
            Your contract is signed. Click below to complete your secure payment.
          </p>
          <Button
            onClick={onProceedToPayment}
            disabled={isPending}
            className="bg-primary-container text-white hover:bg-primary-container/90 rounded-xl px-6"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            <CreditCard className="h-4 w-4 mr-2" />
            Pay {selectedPlan ? (selectedPlan.price_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }) : ""}
            <ExternalLink className="h-3.5 w-3.5 ml-1.5 opacity-60" />
          </Button>
        </div>
      )}

      {/* ── Step 4: Receipt ── */}
      {(currentStep === 4 || paymentComplete) && (
        <div className="space-y-6">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
            <div className="bg-emerald-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-extrabold text-emerald-800 mb-2">
              Coverage Activated
            </h2>
            <p className="text-emerald-700 text-sm max-w-xs mx-auto">
              Your Vehicle Service Contract is now active. You will receive a confirmation email shortly.
            </p>
          </div>

          {order && (
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 space-y-3 text-sm">
              <h3 className="font-bold text-on-surface">Coverage Summary</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-on-surface-variant">Plan</p>
                  <p className="font-semibold">{order.plan_name}</p>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant">Term</p>
                  <p className="font-semibold">
                    {order.term_years}yr
                    {order.term_miles ? ` / ${order.term_miles.toLocaleString()}mi` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant">Amount Paid</p>
                  <p className="font-semibold">
                    {(order.price_cents / 100).toLocaleString("en-US", {
                      style: "currency",
                      currency: "USD",
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant">Vehicle</p>
                  <p className="font-semibold truncate">{vehicleName}</p>
                </div>
              </div>
            </div>
          )}

          {payment?.receipt_url && (
            <a
              href={payment.receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold text-on-tertiary-container hover:underline"
            >
              View Receipt <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          {contract?.document_url && (
            <a
              href={contract.document_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold text-on-tertiary-container hover:underline"
            >
              Download Signed Contract <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          <Link
            href="/dashboard"
            className="inline-block text-sm font-bold text-on-surface-variant hover:text-on-surface"
          >
            ← Back to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
