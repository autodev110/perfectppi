import { getMyTechProfile } from "@/features/technicians/queries";
import { getOrgTechnicians } from "@/features/organizations/queries";
import { leaveTechOrganization } from "@/features/organizations/invite-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building2, Users } from "lucide-react";
import { getInitials } from "@/lib/utils/formatting";
import { redirect } from "next/navigation";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function TechOrganizationPage() {
  const uiText = await getRequestTranslator();
  const techProfile = await getMyTechProfile();
  if (!techProfile) redirect("/login");

  const org = techProfile.organization;

  if (!org) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.organization_d764d42592")}</h1>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">{uiText("ui.you_are_an_independent_technician_330491dd56")}</p>
              <p className="text-sm text-muted-foreground">{uiText("ui.you_are_not_affiliated_with_any_organization_ae5e33e56b")}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const teammates = await getOrgTechnicians(org.id);

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">{uiText("ui.organization_d764d42592")}</h1>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <Avatar className="h-10 w-10 rounded-lg">
            <AvatarImage src={org.logo_url ?? ""} alt={org.name} />
            <AvatarFallback className="rounded-lg">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>{org.name}</CardTitle>
            <p className="text-sm text-muted-foreground">/{org.slug}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {teammates.length}{uiText("ui.team_member_51a2d17e6c")}{teammates.length !== 1 ? uiText("ui.s_043a718774") : ""}
            </span>
          </div>

          {teammates.length > 0 && (
            <div className="divide-y rounded-lg border">
              {teammates.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={t.profile?.avatar_url ?? ""} />
                    <AvatarFallback className="text-xs">
                      {getInitials(t.profile?.display_name ?? uiText("ui.t_e632b7095b"))}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{t.profile?.display_name ?? "—"}</p>
                    <Badge variant="outline" className="text-xs">
                      {t.is_available ? uiText("ui.accepting_requests_48b41ef009") : uiText("ui.not_accepting_requests_42fb6c4b64")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form action={leaveTechOrganization}>
            <Button type="submit" variant="outline" className="text-destructive hover:text-destructive">{uiText("ui.leave_organization_ec8314da12")}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
