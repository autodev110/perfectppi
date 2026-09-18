import { requireDeveloper } from "@/features/auth/guards";
import { RoleSwitcher } from "@/components/dev/role-switcher";

import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function DevRoleSwitcherPage() {
  const uiText = await getRequestTranslator();
  const profile = await requireDeveloper();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.developer_3fb7b39416")}</h1>
        <p className="text-muted-foreground">{uiText("ui.switch_this_account_into_any_role_to_see_the_b815c60438")}</p>
      </div>

      <RoleSwitcher currentRole={profile.role} isDeveloper={profile.is_developer} />

      <p className="text-xs text-muted-foreground">{uiText("ui.the_same_switcher_appears_in_the_settings_pa_ad7dbb10e5")}</p>
    </div>
  );
}
