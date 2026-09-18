"use client";

import { useState, useEffect, useCallback } from "react";
import { useWarrantyFlow } from "@/features/warranty/hooks";
import type { FullWarrantyFlow, WarrantyPlan } from "@/features/warranty/queries";
import { Shield, Check, ChevronRight, FileText, CreditCard, CheckCircle, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t as uiText } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

// ============================================================================
// Step indicator
// ============================================================================

const STEPS = [uiText("ui.offer_0cf57c63eb"), uiText("ui.select_plan_8709f8943f"), uiText("ui.sign_contract_3c30d5a845"), uiText("ui.payment_7048f38b33"), uiText("ui.receipt_dad5a96923")] as const;

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
  const uiText = useTranslator();
  const term = uiText("ui.year_9c83e31cec", { arg0: String(plan.term_years), arg1: String(plan.term_years > 1 ? "s" : ""), arg2: String(plan.term_miles ? uiText("ui.miles_16ad6db147", { arg0: String(plan.term_miles.toLocaleString()) }) : "") });
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
        <span className="text-xs text-on-surface-variant mb-1">{uiText("ui.one_time_e7a4eae34c")}</span>
      </div>

      <div className="text-xs text-on-surface-variant mb-1">{uiText("ui.deductible_7262ff816b")}<span className="font-semibold text-on-surface">{deductible}</span>
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
              +{plan.inclusions.length - 5}{uiText("ui.more_covered_7cb5661369")}</li>
          )}
        </ul>
      )}
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
  const uiText = useTranslator();
  const { option, order, contract, payment } = flow;
  const router = useRouter();
  const {
    isPending,
    error,
    clearError,
    handleSelectPlan,
    handlePresentContract,
    handleGetSigningUrl,
    handleInitiatePayment,
    handleMarkViewed,
    handleSyncSignatureStatus,
  } = useWarrantyFlow(option.id);

  const [selectedPlanIndex, setSelectedPlanIndex] = useState<number | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(order?.id ?? null);
  const [currentContractId, setCurrentContractId] = useState<string | null>(contract?.id ?? null);
  const [contractSigned, setContractSigned] = useState(
    !!contract?.signed_at,
  );
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [signingUrlLoading, setSigningUrlLoading] = useState(false);
  const [paymentComplete] = useState(payment?.status === "completed");
  const [awaitingPaymentConfirmation, setAwaitingPaymentConfirmation] = useState(
    paymentCallback === "success" && payment?.status !== "completed",
  );

  useEffect(() => {
    if (paymentCallback === "success" && payment?.status !== "completed") {
      setAwaitingPaymentConfirmation(true);
    } else {
      setAwaitingPaymentConfirmation(false);
    }
  }, [paymentCallback, payment?.status]);

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

  async function onProceedToPayment() {
    if (!currentContractId) return;
    const checkoutUrl = await handleInitiatePayment(currentContractId);
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    }
  }

  async function onCheckSignatureStatus() {
    if (!currentContractId) return;
    const signed = await handleSyncSignatureStatus(currentContractId);
    if (signed) {
      setContractSigned(true);
      router.refresh();
    }
  }

  const tryAutoSyncSignature = useCallback(async () => {
    if (!currentContractId || contractSigned) return;
    const signed = await handleSyncSignatureStatus(currentContractId);
    if (signed) {
      setContractSigned(true);
      router.refresh();
    }
  }, [currentContractId, contractSigned, handleSyncSignatureStatus, router]);

  useEffect(() => {
    if (!currentContractId || contractSigned) return;

    const interval = window.setInterval(() => {
      void tryAutoSyncSignature();
    }, 8000);

    const onFocus = () => {
      void tryAutoSyncSignature();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [currentContractId, contractSigned, tryAutoSyncSignature]);

  useEffect(() => {
    const contractId = currentContractId;
    if (!contractId || contractSigned) {
      setSigningUrl(null);
      setSigningUrlLoading(false);
      return;
    }

    const ensuredContractId: string = contractId;
    let active = true;
    async function loadSigningUrl() {
      setSigningUrlLoading(true);
      const url = await handleGetSigningUrl(ensuredContractId);
      if (!active) return;

      if (url === "__SIGNED_ALREADY__") {
        setContractSigned(true);
        setSigningUrlLoading(false);
        router.refresh();
        return;
      }

      setSigningUrl(url);
      setSigningUrlLoading(false);
    }

    void loadSigningUrl();
    return () => {
      active = false;
    };
  }, [contractSigned, currentContractId, handleGetSigningUrl, router]);

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
          <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{uiText("ui.vehicle_service_contract_d68051a5e7")}</span>
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
          <button onClick={clearError} className="ml-auto text-xs underline">{uiText("ui.dismiss_48845bff33")}</button>
        </div>
      )}

      {/* ── Step 0/1: Plan Selection ── */}
      {currentStep <= 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="font-bold text-on-surface text-lg mb-1">{uiText("ui.choose_your_plan_246e9263d5")}</h2>
            <p className="text-sm text-on-surface-variant">{uiText("ui.select_the_coverage_that_fits_your_needs_all_ccc474481b")}</p>
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
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{uiText("ui.proceed_to_contract_e91f4e75af")}<ChevronRight className="h-4 w-4 ml-1" />
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
            <h2 className="font-bold text-on-surface text-lg">{uiText("ui.review_sign_contract_e2df6ba9b2")}</h2>
          </div>

          {selectedPlan && (
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-4 text-sm">
              <p className="font-semibold text-on-surface">{selectedPlan.name}</p>
              <p className="text-on-surface-variant text-xs mt-0.5">
                {selectedPlan.term_years}{uiText("ui.yr_5ee26e7e05")}{selectedPlan.term_miles ? uiText("ui.mi_d92ee53fd6", { arg0: String(selectedPlan.term_miles.toLocaleString()) }) : ""} &middot;{" "}
                {(selectedPlan.price_cents / 100).toLocaleString(uiText("ui.en_us_5c49f88daf"), {
                  style: "currency",
                  currency: "USD",
                })}
              </p>
            </div>
          )}

          <p className="text-sm text-on-surface-variant">{uiText("ui.please_read_the_contract_carefully_payment_w_f0a538d1df")}</p>

          {currentContractId && !contractSigned && (
            <div className="space-y-3">
              {signingUrlLoading && (
                <div className="flex items-center justify-center h-20 bg-surface-container rounded-xl">
                  <Loader2 className="h-5 w-5 animate-spin text-on-surface-variant" />
                </div>
              )}
              {signingUrl && (
                <a
                  href={signingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-tertiary-container hover:underline"
                >{uiText("ui.open_signing_page_in_new_tab_cca5a305eb")}<ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{uiText("ui.sign_in_the_new_tab_then_click_164d7d1b95")}<span className="font-semibold">{uiText("ui.i_ve_signed_check_status_54076e1e6f")}</span>.
              </div>
              <Button
                variant="outline"
                onClick={onCheckSignatureStatus}
                disabled={isPending}
                className="rounded-xl"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{uiText("ui.i_ve_signed_check_status_54076e1e6f")}</Button>
            </div>
          )}

          {contractSigned && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg text-sm text-emerald-700 border border-emerald-200">
                <CheckCircle className="h-4 w-4" />{uiText("ui.contract_signed_successfully_0deca9a378")}</div>
              <Button
                onClick={onProceedToPayment}
                disabled={isPending}
                className="bg-primary-container text-white hover:bg-primary-container/90 rounded-xl px-6"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                <CreditCard className="h-4 w-4 mr-2" />{uiText("ui.proceed_to_payment_982a36acea")}</Button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Payment (Stripe redirect in progress) ── */}
      {currentStep === 3 && !paymentComplete && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary-container" />
            <h2 className="font-bold text-on-surface text-lg">{uiText("ui.complete_payment_fa6674f100")}</h2>
          </div>
          <p className="text-sm text-on-surface-variant">{uiText("ui.your_contract_is_signed_click_below_to_compl_df167b3454")}</p>

          {awaitingPaymentConfirmation && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">{uiText("ui.payment_submitted_006fbb3905")}</p>
              <p className="text-amber-700">{uiText("ui.waiting_for_stripe_webhook_confirmation_refr_c76318b1b6")}</p>
              <Button
                variant="outline"
                className="mt-3 border-amber-300 text-amber-800 hover:bg-amber-100"
                onClick={() => router.refresh()}
              >{uiText("ui.check_payment_status_f451204d2e")}</Button>
            </div>
          )}

          {!awaitingPaymentConfirmation && (
            <Button
              onClick={onProceedToPayment}
              disabled={isPending}
              className="bg-primary-container text-white hover:bg-primary-container/90 rounded-xl px-6"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              <CreditCard className="h-4 w-4 mr-2" />{uiText("ui.pay_761d0751f5")}{selectedPlan ? (selectedPlan.price_cents / 100).toLocaleString(uiText("ui.en_us_5c49f88daf"), { style: "currency", currency: "USD" }) : ""}
              <ExternalLink className="h-3.5 w-3.5 ml-1.5 opacity-60" />
            </Button>
          )}
        </div>
      )}

      {/* ── Step 4: Receipt ── */}
      {(currentStep === 4 || paymentComplete) && (
        <div className="space-y-6">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
            <div className="bg-emerald-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-extrabold text-emerald-800 mb-2">{uiText("ui.coverage_activated_deff8ac954")}</h2>
            <p className="text-emerald-700 text-sm max-w-xs mx-auto">{uiText("ui.your_vehicle_service_contract_is_now_active__def8a2ede6")}</p>
          </div>

          {order && (
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5 space-y-3 text-sm">
              <h3 className="font-bold text-on-surface">{uiText("ui.coverage_summary_dd8a144cf9")}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-on-surface-variant">{uiText("ui.plan_fa8ed0bdab")}</p>
                  <p className="font-semibold">{order.plan_name}</p>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant">{uiText("ui.term_c6f3bfd456")}</p>
                  <p className="font-semibold">
                    {order.term_years}{uiText("ui.yr_5ee26e7e05")}{order.term_miles ? uiText("ui.mi_d92ee53fd6", { arg0: String(order.term_miles.toLocaleString()) }) : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant">{uiText("ui.amount_paid_e3d877ba6b")}</p>
                  <p className="font-semibold">
                    {(order.price_cents / 100).toLocaleString(uiText("ui.en_us_5c49f88daf"), {
                      style: "currency",
                      currency: "USD",
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant">{uiText("ui.vehicle_a62394ba4a")}</p>
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
            >{uiText("ui.view_receipt_9850c651fa")}<ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          {contract?.document_url && (
            <a
              href={`/api/warranty/contracts/${contract.id}/document`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold text-on-tertiary-container hover:underline"
            >{uiText("ui.download_signed_contract_f1d076b775")}<ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          <Link
            href="/dashboard"
            className="inline-block text-sm font-bold text-on-surface-variant hover:text-on-surface"
          >{uiText("ui.back_to_dashboard_b86bca30a1")}</Link>
        </div>
      )}
    </div>
  );
}
