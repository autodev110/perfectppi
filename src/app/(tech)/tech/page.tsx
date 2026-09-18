import { getMyTechProfile } from "@/features/technicians/queries";
import { getMyTechQueueCount } from "@/features/ppi/queries";
import { ClipboardCheck, ShieldCheck, TrendingUp } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyTechnicianCredentials } from "@/features/technicians/credentials";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function TechDashboardPage() {
  const uiText = await getRequestTranslator();
  const techProfile = await getMyTechProfile();
  if (!techProfile) redirect("/login");

  const [queueCount, credentials] = await Promise.all([
    getMyTechQueueCount(),
    getMyTechnicianCredentials(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const activeCredentialCount = credentials.filter(
    (credential) =>
      credential.status === "approved" &&
      (!credential.expires_on || credential.expires_on >= today),
  ).length;

  return (
    <div className="space-y-12">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-4xl font-black font-heading tracking-tighter text-on-surface mb-2">{uiText("ui.technician_portal_f1b224c6ad")}</h1>
          <p className="text-on-surface-variant font-medium">{uiText("ui.precision_overview_inspection_ledger_a9dc71556d")}</p>
        </div>
        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex items-center gap-6 border border-outline-variant/10">
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{uiText("ui.credential_status_ced60a751f")}</p>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-700/20 bg-emerald-700/10 px-3 py-1">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              <span className="text-xs font-black uppercase text-emerald-800">
                {activeCredentialCount > 0
                  ? uiText("ui.active_reviewed_credential_ae33d4c7ba", { arg0: String(activeCredentialCount), arg1: String(activeCredentialCount === 1 ? "" : "s") })
                  : uiText("ui.no_active_reviewed_credential_606b98f9ee")}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Bento Stats */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Active Jobs */}
        <div className="bg-primary-container p-8 rounded-2xl relative overflow-hidden group">
          <div className="relative z-10">
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-4">{uiText("ui.pending_in_queue_7b57a57277")}</p>
            <h3 className="text-5xl font-black font-heading text-white mb-2">
              {queueCount}
            </h3>
            <Link
              href="/tech/ppi"
              className="text-slate-400 text-sm font-medium hover:text-white transition-colors"
            >{uiText("ui.view_queue_rarr_9303c44b6a")}</Link>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
            <ClipboardCheck className="h-24 w-24 text-white" />
          </div>
        </div>

        {/* Completed */}
        <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10 relative overflow-hidden">
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-4">{uiText("ui.completed_inspections_3f078b5caa")}</p>
          <h3 className="text-5xl font-black font-heading text-slate-900 mb-2">
            {techProfile.total_inspections.toLocaleString()}
          </h3>
          <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
            <TrendingUp className="h-4 w-4" />
            <span>{uiText("ui.all_time_9755c8d7d4")}</span>
          </div>
        </div>

        {/* Credential review */}
        <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10">
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-4">{uiText("ui.credential_review_c7bc3dbca9")}</p>
          <p className="text-5xl font-black font-heading text-slate-900 mb-2">{activeCredentialCount}</p>
          <p className="text-sm text-on-surface-variant">{uiText("ui.active_credentials_reviewed_by_perfectppi_tr_258edc52b2")}</p>
          <Link
            href="/tech/profile"
            className="mt-4 inline-block text-xs font-bold text-on-tertiary-container hover:underline"
          >{uiText("ui.manage_credentials_rarr_bfdfe5d113")}</Link>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="bg-slate-900 rounded-2xl p-8 text-white flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden shadow-2xl">
        <div className="relative z-10 max-w-md">
          <h4 className="text-2xl font-black font-heading mb-4">{uiText("ui.ready_for_your_next_inspection_c5f49e8dd2")}</h4>
          <p className="text-slate-400 text-sm leading-relaxed">{uiText("ui.check_your_queue_for_pending_assignments_or__89681ee2d5")}</p>
        </div>
        <div className="flex gap-4">
          <Link
            href="/tech/ppi"
            className="px-6 py-3 bg-white text-slate-900 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors"
          >{uiText("ui.view_queue_c16e01398e")}</Link>
          <Link
            href="/tech/profile"
            className="px-6 py-3 bg-white/10 text-white rounded-xl font-bold text-sm hover:bg-white/20 transition-colors"
          >{uiText("ui.edit_profile_fec2ac0f4c")}</Link>
        </div>
      </section>
    </div>
  );
}
