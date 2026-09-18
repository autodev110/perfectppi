import { getMyWarranties } from "@/features/warranty/queries";
import Link from "next/link";
import { Shield, ChevronRight, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

function statusLabel(orderStatus: string | undefined, optionStatus: string): string {
  if (!orderStatus) {
    if (optionStatus === "offered" || optionStatus === "viewed") return uiText("ui.plan_available_1db8ea4550");
    return uiText("ui.offered_95e7004b8d");
  }
  const map: Record<string, string> = {
    contract_pending: uiText("ui.pending_signature_ce7438d6dc"),
    signed: uiText("ui.signed_awaiting_payment_a7d3a42f94"),
    payment_pending: uiText("ui.payment_pending_ac3729c091"),
    paid: uiText("ui.active_coverage_f028d9fa05"),
    failed: uiText("ui.payment_failed_a287ab868d"),
    cancelled: uiText("ui.cancelled_d353a99eb4"),
  };
  return map[orderStatus] ?? orderStatus;
}

function statusColor(orderStatus: string | undefined): string {
  if (!orderStatus) return "text-on-tertiary-container bg-tertiary-container/20";
  if (orderStatus === "paid") return "text-emerald-700 bg-emerald-50";
  if (orderStatus === "failed" || orderStatus === "cancelled")
    return "text-red-700 bg-red-50";
  if (orderStatus === "signed" || orderStatus === "payment_pending")
    return "text-amber-700 bg-amber-50";
  return "text-on-surface-variant bg-surface-container";
}

function StatusIcon({ status }: { status: string | undefined }) {
  if (status === "paid") return <CheckCircle className="h-4 w-4 text-emerald-600" />;
  if (status === "failed") return <AlertCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-amber-500" />;
}

export default async function MyWarrantiesPage() {
  const uiText = await getRequestTranslator();
  const warranties = await getMyWarranties();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface mb-1">{uiText("ui.my_warranties_cec28470c5")}</h1>
        <p className="text-on-surface-variant text-sm font-medium">{uiText("ui.vehicle_service_contracts_and_coverage_statu_288c89e60c")}</p>
      </header>

      {warranties.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-surface-container-lowest rounded-2xl border border-outline-variant/10">
          <div className="bg-primary-container/10 rounded-full p-4 mb-4">
            <Shield className="h-8 w-8 text-primary-container" />
          </div>
          <h3 className="text-lg font-bold text-on-surface mb-2">{uiText("ui.no_warranties_yet_0d14ea4f33")}</h3>
          <p className="text-sm text-on-surface-variant max-w-xs mb-6">{uiText("ui.complete_a_vehicle_inspection_to_unlock_vsc__7299003f18")}</p>
          <Link
            href="/dashboard/ppi"
            className="px-5 py-2.5 bg-primary-container text-white rounded-xl text-sm font-bold"
          >{uiText("ui.view_inspections_234282a9ca")}</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {warranties.map(({ option, order, vehicle }) => {
            const vehicleName = vehicle
              ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
                  .filter(Boolean)
                  .join(" ")
              : uiText("ui.unknown_vehicle_615ff95383");

            return (
              <Link
                key={option.id}
                href={`/dashboard/warranty/${option.id}`}
                className="flex items-center gap-4 bg-surface-container-lowest rounded-xl px-5 py-4 hover:bg-surface-container transition-colors border border-outline-variant/10 group"
              >
                <div className="bg-primary-container/10 rounded-lg p-2.5 shrink-0">
                  <Shield className="h-5 w-5 text-primary-container" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-bold text-on-surface text-sm truncate">
                      {vehicleName}
                    </p>
                  </div>
                  {order && (
                    <p className="text-xs text-on-surface-variant truncate">
                      {order.plan_name} &middot; {order.term_years}{uiText("ui.yr_5ee26e7e05")}{order.term_miles ? uiText("ui.mi_d92ee53fd6", { arg0: String(order.term_miles.toLocaleString()) }) : ""}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor(order?.status)}`}
                  >
                    <StatusIcon status={order?.status} />
                    {statusLabel(order?.status, option.status)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-on-surface-variant group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
