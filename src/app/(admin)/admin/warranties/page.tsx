import { createAdminClient } from "@/lib/supabase/admin";
import { Shield, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

async function getWarrantyStats() {
  const admin = createAdminClient();

  const [
    { count: totalOptions },
    { count: activeCount },
    { count: pendingCount },
    { data: recentOrders },
  ] = await Promise.all([
    admin.from("warranty_options").select("*", { count: "exact", head: true }).neq("status", "not_offered"),
    admin.from("warranty_orders").select("*", { count: "exact", head: true }).eq("status", "paid"),
    admin.from("warranty_orders").select("*", { count: "exact", head: true }).in("status", ["contract_pending", "signed", "payment_pending"]),
    admin
      .from("warranty_orders")
      .select("id, plan_name, price_cents, status, selected_at, warranty_option_id")
      .order("selected_at", { ascending: false })
      .limit(20),
  ]);

  return {
    totalOptions: totalOptions ?? 0,
    activeCount: activeCount ?? 0,
    pendingCount: pendingCount ?? 0,
    recentOrders: recentOrders ?? [],
  };
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    paid: { label: uiText("ui.active_9234069589"), className: "bg-emerald-50 text-emerald-700" },
    contract_pending: { label: uiText("ui.pending_signature_ce7438d6dc"), className: "bg-amber-50 text-amber-700" },
    signed: { label: uiText("ui.signed_08251562b3"), className: "bg-blue-50 text-blue-700" },
    payment_pending: { label: uiText("ui.payment_pending_ac3729c091"), className: "bg-amber-50 text-amber-700" },
    failed: { label: uiText("ui.failed_031a8f0f65"), className: "bg-red-50 text-red-700" },
    cancelled: { label: uiText("ui.cancelled_d353a99eb4"), className: "bg-surface-container text-on-surface-variant" },
  };
  const entry = map[status] ?? { label: status, className: "bg-surface-container text-on-surface-variant" };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${entry.className}`}>
      {entry.label}
    </span>
  );
}

export default async function AdminWarrantiesPage() {
  const uiText = await getRequestTranslator();
  const { totalOptions, activeCount, pendingCount, recentOrders } = await getWarrantyStats();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface mb-1">{uiText("ui.warranties_c6aa176bba")}</h1>
        <p className="text-on-surface-variant text-sm font-medium">{uiText("ui.vehicle_service_contract_offers_orders_and_a_5e779807fa")}</p>
      </header>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: uiText("ui.offers_created_64d4fa15d7"), value: totalOptions, icon: Shield, color: "bg-secondary-container" },
          { label: uiText("ui.active_coverage_f028d9fa05"), value: activeCount, icon: CheckCircle, color: "bg-emerald-100" },
          { label: uiText("ui.pending_completion_4b854a83ea"), value: pendingCount, icon: Clock, color: "bg-amber-100" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 shadow-sm"
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">
              {label}
            </p>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-black text-on-surface">
                {String(value).padStart(2, "0")}
              </p>
              <div className={`${color} p-2 rounded-lg`}>
                <Icon className="h-5 w-5 text-on-surface-variant" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/10">
          <h2 className="font-bold text-on-surface">{uiText("ui.recent_orders_764883b3f5")}</h2>
        </div>
        {recentOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-on-surface-variant/40 mx-auto mb-3" />
            <p className="text-sm text-on-surface-variant">{uiText("ui.no_warranty_orders_yet_fa5e4431df")}</p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/10">
            {recentOrders.map((order) => (
              <div key={order.id} className="px-6 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-on-surface text-sm truncate">{order.plan_name}</p>
                  <p className="text-xs text-on-surface-variant font-mono">
                    {order.id.slice(0, 8)}…
                  </p>
                </div>
                <p className="text-sm font-bold text-on-surface">
                  {(order.price_cents / 100).toLocaleString(uiText("ui.en_us_5c49f88daf"), { style: "currency", currency: "USD" })}
                </p>
                {statusBadge(order.status)}
                <p className="text-xs text-on-surface-variant hidden sm:block">
                  {new Date(order.selected_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
