import { createAdminClient } from "@/lib/supabase/admin";
import { FileText, CheckCircle, Clock } from "lucide-react";

import { getRequestTranslator } from "@/lib/i18n/server";

async function getContractData() {
  const admin = createAdminClient();

  const [
    { count: total },
    { count: signedCount },
    { count: pendingCount },
    { data: rows },
  ] = await Promise.all([
    admin.from("contracts").select("*", { count: "exact", head: true }),
    admin.from("contracts").select("*", { count: "exact", head: true }).not("signed_at", "is", null),
    admin.from("contracts").select("*", { count: "exact", head: true }).is("signed_at", null),
    admin
      .from("contracts")
      .select("id, presented_at, signed_at, docuseal_id, signer_id")
      .order("presented_at", { ascending: false })
      .limit(25),
  ]);

  return {
    total: total ?? 0,
    signedCount: signedCount ?? 0,
    pendingCount: pendingCount ?? 0,
    rows: rows ?? [],
  };
}

export default async function AdminContractsPage() {
  const uiText = await getRequestTranslator();
  const { total, signedCount, pendingCount, rows } = await getContractData();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface mb-1">{uiText("ui.contracts_0488acc63d")}</h1>
        <p className="text-on-surface-variant text-sm font-medium">{uiText("ui.docuseal_e_signature_contracts_and_signature_5ff2f7fd5b")}</p>
      </header>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: uiText("ui.total_contracts_90465089d6"), value: total, icon: FileText, color: "bg-secondary-container" },
          { label: uiText("ui.signed_08251562b3"), value: signedCount, icon: CheckCircle, color: "bg-emerald-100" },
          { label: uiText("ui.pending_signature_ce7438d6dc"), value: pendingCount, icon: Clock, color: "bg-amber-100" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/10 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3">{label}</p>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-black text-on-surface">{String(value).padStart(2, "0")}</p>
              <div className={`${color} p-2 rounded-lg`}>
                <Icon className="h-5 w-5 text-on-surface-variant" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/10">
          <h2 className="font-bold text-on-surface">{uiText("ui.recent_contracts_8f7dcf37db")}</h2>
        </div>
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-on-surface-variant">{uiText("ui.no_contracts_yet_d533d4c430")}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/10">
                <th className="px-6 py-3">{uiText("ui.contract_id_0b6d2e4b84")}</th>
                <th className="px-6 py-3">{uiText("ui.docuseal_id_26c2b8233e")}</th>
                <th className="px-6 py-3">{uiText("ui.presented_5e5067bd5a")}</th>
                <th className="px-6 py-3">{uiText("ui.status_920e413c7d")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-6 py-3 font-mono text-xs text-on-surface-variant">{row.id.slice(0, 8)}…</td>
                  <td className="px-6 py-3 text-on-surface-variant">{row.docuseal_id ?? "—"}</td>
                  <td className="px-6 py-3 text-on-surface-variant">{new Date(row.presented_at).toLocaleDateString()}</td>
                  <td className="px-6 py-3">
                    {row.signed_at ? (
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{uiText("ui.signed_08251562b3")}</span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{uiText("ui.pending_331551b0de")}</span>
                    )}
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
