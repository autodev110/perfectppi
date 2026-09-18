import { requireRole } from "@/features/auth/guards";
import { RoleSwitcher } from "@/components/dev/role-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { USER_ROLE_LABELS } from "@/types/enums";
import { PrivacyCenter } from "@/components/legal/privacy-center";

import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const uiText = await getRequestTranslator();
  const profile = await requireRole(["admin"]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.settings_74a883a037")}</h1>
        <p className="text-muted-foreground">{uiText("ui.account_and_access_settings_d407c8eeaa")}</p>
      </div>

      <RoleSwitcher
        currentRole={profile.role}
        isDeveloper={profile.is_developer}
      />

      <Card>
        <CardHeader>
          <CardTitle>{uiText("ui.current_access_7afa588e5a")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">{uiText("ui.signed_in_as_abc50e334b")}{" "}
            <span className="font-medium text-foreground">
              {profile.display_name || profile.username || uiText("ui.this_account_2faca96de4")}
            </span>{" "}{uiText("ui.with_the_6e5102cd35")}<Badge variant="secondary">{USER_ROLE_LABELS[profile.role]}</Badge>{" "}{uiText("ui.role_41b3a88460")}</p>
          <p className="text-muted-foreground">{uiText("ui.admin_access_is_provisioned_directly_against_f0ea43c86f")}</p>
        </CardContent>
      </Card>
      <PrivacyCenter />
    </div>
  );
}
