import { createAdminClient } from "@/lib/supabase/admin";
import { FileText, CheckCircle, Clock } from "lucide-react";

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
  const { total, signedCount, pendingCount, rows } = await getContractData();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-on-surface mb-1">
          Contracts
        </h1>
        <p className="text-on-surface-variant text-sm font-medium">
          DocuSeal e-signature contracts and signature status
        </p>
      </header>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Contracts", value: total, icon: FileText, color: "bg-secondary-container" },
          { label: "Signed", value: signedCount, icon: CheckCircle, color: "bg-emerald-100" },
          { label: "Pending Signature", value: pendingCount, icon: Clock, color: "bg-amber-100" },
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
          <h2 className="font-bold text-on-surface">Recent Contracts</h2>
        </div>
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-on-surface-variant">No contracts yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/10">
                <th className="px-6 py-3">Contract ID</th>
                <th className="px-6 py-3">DocuSeal ID</th>
                <th className="px-6 py-3">Presented</th>
                <th className="px-6 py-3">Status</th>
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
                      <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        Signed
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                        Pending
                      </span>
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
