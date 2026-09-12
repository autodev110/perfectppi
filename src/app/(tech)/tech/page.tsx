import { getMyTechProfile } from "@/features/technicians/queries";
import { getMyTechQueueCount } from "@/features/ppi/queries";
import { ClipboardCheck, ShieldCheck, TrendingUp } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyTechnicianCredentials } from "@/features/technicians/credentials";

export default async function TechDashboardPage() {
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
          <h1 className="text-4xl font-black font-heading tracking-tighter text-on-surface mb-2">
            Technician Portal
          </h1>
          <p className="text-on-surface-variant font-medium">
            Precision Overview &amp; Inspection Ledger
          </p>
        </div>
        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex items-center gap-6 border border-outline-variant/10">
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              Credential status
            </p>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-700/20 bg-emerald-700/10 px-3 py-1">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              <span className="text-xs font-black uppercase text-emerald-800">
                {activeCredentialCount > 0
                  ? `${activeCredentialCount} active reviewed credential${activeCredentialCount === 1 ? "" : "s"}`
                  : "No active reviewed credential"}
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
            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest mb-4">
              Pending in Queue
            </p>
            <h3 className="text-5xl font-black font-heading text-white mb-2">
              {queueCount}
            </h3>
            <Link
              href="/tech/ppi"
              className="text-slate-400 text-sm font-medium hover:text-white transition-colors"
            >
              View queue &rarr;
            </Link>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
            <ClipboardCheck className="h-24 w-24 text-white" />
          </div>
        </div>

        {/* Completed */}
        <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10 relative overflow-hidden">
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-4">
            Completed Inspections
          </p>
          <h3 className="text-5xl font-black font-heading text-slate-900 mb-2">
            {techProfile.total_inspections.toLocaleString()}
          </h3>
          <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
            <TrendingUp className="h-4 w-4" />
            <span>All time</span>
          </div>
        </div>

        {/* Credential review */}
        <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/10">
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-4">
            Credential review
          </p>
          <p className="text-5xl font-black font-heading text-slate-900 mb-2">{activeCredentialCount}</p>
          <p className="text-sm text-on-surface-variant">Active credentials reviewed by PerfectPPI Trust &amp; Safety</p>
          <Link
            href="/tech/profile"
            className="mt-4 inline-block text-xs font-bold text-on-tertiary-container hover:underline"
          >
            Manage credentials &rarr;
          </Link>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="bg-slate-900 rounded-2xl p-8 text-white flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden shadow-2xl">
        <div className="relative z-10 max-w-md">
          <h4 className="text-2xl font-black font-heading mb-4">
            Ready for your next inspection?
          </h4>
          <p className="text-slate-400 text-sm leading-relaxed">
            Check your queue for pending assignments or update your profile to
            attract more inspection requests.
          </p>
        </div>
        <div className="flex gap-4">
          <Link
            href="/tech/ppi"
            className="px-6 py-3 bg-white text-slate-900 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors"
          >
            View Queue
          </Link>
          <Link
            href="/tech/profile"
            className="px-6 py-3 bg-white/10 text-white rounded-xl font-bold text-sm hover:bg-white/20 transition-colors"
          >
            Edit Profile
          </Link>
        </div>
      </section>
    </div>
  );
}
