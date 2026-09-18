import { getMyOrg, getOrgTechnicians } from "@/features/organizations/queries";
import { requireRole } from "@/features/auth/guards";
import { getOrgPartnerConnections } from "@/features/partner/queries";
import { RoleSwitcher } from "@/components/dev/role-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatDate } from "@/lib/utils/formatting";
import { Building2, Users, Link as LinkIcon, Hash, Plug } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PrivacyCenter } from "@/components/legal/privacy-center";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function OrgSettingsPage() {
  const uiText = await getRequestTranslator();
  const profile = await requireRole(["org_manager"]);

  const org = await getMyOrg();
  if (!org) redirect("/login");

  const technicians = await getOrgTechnicians(org.id);
  const techCount = technicians.length;

  const connections = await getOrgPartnerConnections(org.id);
  const activeConnection = connections.find((c) => c.status === "active");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.organization_settings_cc1d9e6165")}</h1>
        <p className="text-muted-foreground">{uiText("ui.manage_your_organization_configuration_fbaad6aa55")}</p>
      </div>

      <RoleSwitcher
        currentRole={profile.role}
        isDeveloper={profile.is_developer}
      />

      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />{uiText("ui.organization_identity_51722ef4e1")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-muted-foreground">{uiText("ui.name_dcd1d5223f")}</p>
              <p className="mt-1 font-semibold">{org.name}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">{uiText("ui.created_d70b9e24bc")}</p>
              <p className="mt-1">{formatDate(org.created_at)}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Hash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{uiText("ui.slug_d15387ecc6")}</p>
                <p className="font-mono text-sm text-muted-foreground">{org.slug}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{uiText("ui.used_in_your_public_organization_url_set_at__7d0776023f")}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <LinkIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{uiText("ui.organization_id_1f46632263")}</p>
                <p className="font-mono text-xs text-muted-foreground break-all">{org.id}</p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{uiText("ui.to_update_your_name_description_or_logo_go_t_c55e05d2a2")}</p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/org/profile">{uiText("ui.edit_profile_fec2ac0f4c")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Membership */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />{uiText("ui.membership_9feceb9333")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-muted-foreground">{uiText("ui.technicians_8bb7fac529")}</p>
              <p className="mt-1 text-2xl font-bold">{techCount}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">{uiText("ui.membership_policy_e1b42ca51a")}</p>
              <div className="mt-1">
                <Badge variant="secondary">{uiText("ui.invite_only_8e76da24ab")}</Badge>
                <p className="mt-1 text-xs text-muted-foreground">{uiText("ui.technicians_join_only_when_you_add_them_from_3fa3535c5b")}</p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{uiText("ui.add_or_remove_technicians_from_your_roster_fc826e36c4")}</p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/org/technicians">{uiText("ui.manage_technicians_2258a2e2d7")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Status only. Connecting, rotating and revoking all live on the
          DealerSpace page, so there is one place to act and no second copy of
          the controls to keep in sync. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4" />{uiText("ui.dealerspace_integration_d9a02ce966")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                {activeConnection
                  ? (activeConnection.displayName ?? uiText("ui.dealerspace_7d7288383a"))
                  : uiText("ui.not_connected_0303e18246")}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {activeConnection
                  ? uiText("ui.dealership_connected_8401b47b77", { arg0: String(activeConnection.externalOrganizationId), arg1: String(formatDate(activeConnection.connectedAt)) })
                  : uiText("ui.connect_a_dealership_management_system_to_re_ef6aeab435")}
              </p>
            </div>
            <Badge variant={activeConnection ? "default" : "secondary"}>
              {activeConnection ? uiText("ui.connected_22965568d2") : uiText("ui.not_connected_0303e18246")}
            </Badge>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{uiText("ui.installation_codes_credentials_and_linked_te_7d54ceca51")}</p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/org/inspections/dealerspace">{uiText("ui.manage_dealerspace_16f342bc1e")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      <PrivacyCenter />
    </div>
  );
}
