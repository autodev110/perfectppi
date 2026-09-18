import { getMyOrgWithTechnicianCount } from "@/features/organizations/queries";
import { Building2, Users, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function OrgDashboardPage() {
  const uiText = await getRequestTranslator();
  const result = await getMyOrgWithTechnicianCount();
  if (!result) redirect("/login");

  const { org, techCount } = result;

  return (
    <div className="space-y-12">
      {/* Header */}
      <header>
        <h1 className="text-4xl font-extrabold tracking-tight text-on-surface mb-2">
          {org.name}
        </h1>
        <p className="text-on-surface-variant font-medium">{uiText("ui.organization_overview_management_9002b01950")}</p>
      </header>

      {/* Stats */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">{uiText("ui.team_size_d879817731")}</p>
          <div className="flex items-end justify-between">
            <div>
              <h3 className="text-4xl font-black text-on-surface leading-none">
                {String(techCount).padStart(2, "0")}
              </h3>
              <p className="text-sm font-medium text-on-surface-variant mt-1">{uiText("ui.technicians_8bb7fac529")}</p>
            </div>
            <div className="bg-secondary-container p-2 rounded-lg">
              <Users className="h-5 w-5 text-on-secondary-container" />
            </div>
          </div>
          <Link
            href="/org/technicians"
            className="mt-4 inline-block text-xs font-bold text-on-tertiary-container hover:underline"
          >{uiText("ui.manage_team_rarr_826b902573")}</Link>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">{uiText("ui.inspections_20cbe85cdd")}</p>
          <div className="flex items-end justify-between">
            <div>
              <h3 className="text-4xl font-black text-on-surface leading-none">
                —
              </h3>
              <p className="text-sm font-medium text-on-surface-variant mt-1">{uiText("ui.total_inspections_6a1ae45caa")}</p>
            </div>
            <div className="bg-tertiary-container p-2 rounded-lg">
              <ClipboardCheck className="h-5 w-5 text-on-tertiary-container" />
            </div>
          </div>
          <Link
            href="/org/inspections"
            className="mt-4 inline-block text-xs font-bold text-on-tertiary-container hover:underline"
          >{uiText("ui.view_all_rarr_e1d1e04f78")}</Link>
        </div>

        <div className="bg-primary-container p-6 rounded-xl shadow-lg text-white">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary-fixed-dim mb-4">{uiText("ui.organization_d764d42592")}</p>
          <div>
            <h3 className="text-2xl font-bold text-white">{org.name}</h3>
            <p className="text-xs mt-1 text-primary-fixed-dim">{uiText("ui.slug_674816db8c")}{org.slug}
            </p>
          </div>
          <Link
            href="/org/profile"
            className="mt-4 inline-block text-xs font-bold text-white hover:underline"
          >{uiText("ui.edit_profile_rarr_02a0239063")}</Link>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="bg-slate-900 rounded-2xl p-8 text-white flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl">
        <div className="max-w-md">
          <h4 className="text-2xl font-black font-heading mb-2">{uiText("ui.manage_your_team_fd4fa0c4a5")}</h4>
          <p className="text-slate-400 text-sm">{uiText("ui.invite_technicians_manage_assignments_and_tr_0932c96522")}</p>
        </div>
        <div className="flex gap-4">
          <Link
            href="/org/technicians"
            className="px-6 py-3 bg-white text-slate-900 rounded-xl font-bold text-sm"
          >
            <Users className="inline h-4 w-4 mr-2" />{uiText("ui.view_team_15bb12eef5")}</Link>
          <Link
            href="/org/settings"
            className="px-6 py-3 bg-white/10 text-white rounded-xl font-bold text-sm"
          >
            <Building2 className="inline h-4 w-4 mr-2" />{uiText("ui.settings_74a883a037")}</Link>
        </div>
      </section>
    </div>
  );
}
