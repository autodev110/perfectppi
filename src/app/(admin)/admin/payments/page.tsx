import { createAdminClient } from "@/lib/supabase/admin";
import { CreditCard, CheckCircle, AlertCircle, Clock } from "lucide-react";

import { getRequestTranslator } from "@/lib/i18n/server";

async function getPaymentData() {
  const admin = createAdminClient();

  const [
    { count: total },
    { count: completedCount },
    { count: failedCount },
    { data: rows },
  ] = await Promise.all([
    admin.from("payments").select("*", { count: "exact", head: true }),
    admin.from("payments").select("*", { count: "exact", head: true }).eq("status", "completed"),
    admin.from("payments").select("*", { count: "exact", head: true }).eq("status", "failed"),
    admin
      .from("payments")
      .select("id, amount_cents, method, status, paid_at, created_at, stripe_payment_id")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  // Sum revenue
  const { data: revenueData } = await admin
    .from("payments")
    .select("amount_cents")
    .eq("status", "completed");

  const totalRevenueCents = (revenueData ?? []).reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);

  return {
    total: total ?? 0,
    completedCount: completedCount ?? 0,
    failedCount: failedCount ?? 0,
    totalRevenueCents,
    rows: rows ?? [],
  };
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700",
    failed: "bg-red-50 text-red-700",
    pending: "bg-amber-50 text-amber-700",
    refunded: "bg-blue-50 text-blue-700",
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] ?? "bg-surface-container text-on-surface-variant"}`}>
      {status}
    </span>
  );
}

export default async function AdminPaymentsPage() {
  const uiText = await getRequestTranslator();
  const { total, completedCount, failedCount, totalRevenueCents, rows } = await getPaymentData();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface mb-1">{uiText("ui.payments_632e1c5839")}</h1>
        <p className="text-on-surface-variant text-sm font-medium">{uiText("ui.stripe_transactions_and_payment_status_374037f451")}</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: uiText("ui.total_payments_533d529d37"), value: String(total).padStart(2, "0"), icon: CreditCard, color: "bg-secondary-container" },
          { label: uiText("ui.completed_22a970d2e5"), value: String(completedCount).padStart(2, "0"), icon: CheckCircle, color: "bg-emerald-100" },
          { label: uiText("ui.failed_031a8f0f65"), value: String(failedCount).padStart(2, "0"), icon: AlertCircle, color: "bg-red-100" },
          {
            label: uiText("ui.revenue_c4b7330bd9"),
            value: (totalRevenueCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
            icon: Clock,
            color: "bg-tertiary-container",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">{label}</p>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-black text-on-surface">{value}</p>
              <div className={`${color} p-2 rounded-lg`}>
                <Icon className="h-5 w-5 text-on-surface-variant" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/10">
          <h2 className="font-bold text-on-surface">{uiText("ui.transaction_history_669cd31f76")}</h2>
        </div>
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-on-surface-variant">{uiText("ui.no_payments_yet_f9063c6998")}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/10">
                <th className="px-6 py-3">{uiText("ui.payment_id_d9c9afd836")}</th>
                <th className="px-6 py-3">{uiText("ui.amount_49e96d7cdf")}</th>
                <th className="px-6 py-3">{uiText("ui.method_52a0f9b65b")}</th>
                <th className="px-6 py-3">{uiText("ui.status_920e413c7d")}</th>
                <th className="px-6 py-3 hidden md:table-cell">{uiText("ui.stripe_id_d7aad2a8d6")}</th>
                <th className="px-6 py-3">{uiText("ui.date_99c40ab405")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-6 py-3 font-mono text-xs text-on-surface-variant">{row.id.slice(0, 8)}…</td>
                  <td className="px-6 py-3 font-semibold text-on-surface">
                    {(row.amount_cents / 100).toLocaleString(uiText("ui.en_us_5c49f88daf"), { style: "currency", currency: "USD" })}
                  </td>
                  <td className="px-6 py-3 capitalize text-on-surface-variant">{row.method.replace("_", " ")}</td>
                  <td className="px-6 py-3">{statusBadge(row.status)}</td>
                  <td className="px-6 py-3 font-mono text-xs text-on-surface-variant hidden md:table-cell">
                    {row.stripe_payment_id ? row.stripe_payment_id.slice(0, 12) + "…" : "—"}
                  </td>
                  <td className="px-6 py-3 text-on-surface-variant text-xs">
                    {new Date(row.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
