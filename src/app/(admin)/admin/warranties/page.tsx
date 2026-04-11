import { createAdminClient } from "@/lib/supabase/admin";
import { Shield, CheckCircle, Clock, AlertCircle } from "lucide-react";

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
    paid: { label: "Active", className: "bg-emerald-50 text-emerald-700" },
    contract_pending: { label: "Pending Signature", className: "bg-amber-50 text-amber-700" },
    signed: { label: "Signed", className: "bg-blue-50 text-blue-700" },
    payment_pending: { label: "Payment Pending", className: "bg-amber-50 text-amber-700" },
    failed: { label: "Failed", className: "bg-red-50 text-red-700" },
    cancelled: { label: "Cancelled", className: "bg-surface-container text-on-surface-variant" },
  };
  const entry = map[status] ?? { label: status, className: "bg-surface-container text-on-surface-variant" };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${entry.className}`}>
      {entry.label}
    </span>
  );
}

export default async function AdminWarrantiesPage() {
  const { totalOptions, activeCount, pendingCount, recentOrders } = await getWarrantyStats();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface mb-1">
          Warranties
        </h1>
        <p className="text-on-surface-variant text-sm font-medium">
          Vehicle Service Contract offers, orders, and active coverage
        </p>
      </header>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Offers Created", value: totalOptions, icon: Shield, color: "bg-secondary-container" },
          { label: "Active Coverage", value: activeCount, icon: CheckCircle, color: "bg-emerald-100" },
          { label: "Pending Completion", value: pendingCount, icon: Clock, color: "bg-amber-100" },
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
          <h2 className="font-bold text-on-surface">Recent Orders</h2>
        </div>
        {recentOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-on-surface-variant/40 mx-auto mb-3" />
            <p className="text-sm text-on-surface-variant">No warranty orders yet</p>
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
                  {(order.price_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}
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
