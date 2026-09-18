import { getMyOrg, getOrgTechnicians } from "@/features/organizations/queries";
import { removeTechnicianFromOrg } from "@/features/organizations/invite-actions";
import { requireRole } from "@/features/auth/guards";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/formatting";
import { redirect } from "next/navigation";
import { InviteTechnicianForm } from "./invite-technician-form";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function ManageTechniciansPage() {
  const uiText = await getRequestTranslator();
  const currentProfile = await requireRole(["org_manager"]);

  const org = await getMyOrg();
  if (!org) redirect("/login");

  const technicians = await getOrgTechnicians(org.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.manage_technicians_2258a2e2d7")}</h1>
        <p className="text-muted-foreground">
          {technicians.length}{uiText("ui.technician_8593a16848")}{technicians.length !== 1 ? uiText("ui.s_043a718774") : ""}{uiText("ui.in_2eb9d0d30d")}{org.name}
        </p>
      </div>

      {/* Current roster */}
      {technicians.length > 0 ? (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">{uiText("ui.technician_9041ccc417")}</th>
                <th className="px-4 py-3 text-left font-medium">{uiText("ui.availability_12f67f8539")}</th>
                <th className="px-4 py-3 text-left font-medium">{uiText("ui.inspections_20cbe85cdd")}</th>
                <th className="px-4 py-3 text-left font-medium">{uiText("ui.actions_ff8059dc67")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {technicians.map((tech) => {
                const profile = tech.profile;
                const isCurrentManager = tech.profile_id === currentProfile.id;
                return (
                  <tr key={tech.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={profile?.avatar_url ?? ""} />
                          <AvatarFallback className="text-xs">
                            {getInitials(profile?.display_name ?? uiText("ui.t_e632b7095b"))}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{profile?.display_name ?? "—"}</p>
                          {profile?.username && (
                            <p className="text-xs text-muted-foreground">@{profile.username}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {tech.is_available ? uiText("ui.accepting_requests_48b41ef009") : uiText("ui.not_accepting_requests_42fb6c4b64")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {tech.total_inspections}
                    </td>
                    <td className="px-4 py-3">
                      {isCurrentManager ? (
                        <span className="text-xs text-muted-foreground">{uiText("ui.current_manager_1b5f5b45f9")}</span>
                      ) : (
                        <form action={removeTechnicianFromOrg.bind(null, tech.id)}>
                          <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">{uiText("ui.remove_c3812fc4ac")}</Button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{uiText("ui.no_technicians_yet_invite_one_below_ea71c8914b")}</p>
      )}

      {/* Invite form */}
      <div>
        <h2 className="mb-4 font-heading text-lg font-semibold">{uiText("ui.add_technician_c62fc0c000")}</h2>
        <InviteTechnicianForm />
      </div>
    </div>
  );
}
