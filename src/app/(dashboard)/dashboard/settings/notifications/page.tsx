import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { getNotificationPreferences } from "@/features/notifications/preferences";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationPreferencesForm } from "@/components/shared/notification-preferences-form";

import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const uiText = await getRequestTranslator();
  const me = await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const preferences = await getNotificationPreferences(me.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">{uiText("ui.notifications_788011833a")}</h1>
          <p className="text-sm text-muted-foreground">{uiText("ui.choose_what_reaches_you_in_the_app_and_on_yo_225d1ad991")}</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link href="/dashboard/settings">{uiText("ui.settings_74a883a037")}</Link></Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{uiText("ui.categories_b8b1d894c6")}</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationPreferencesForm initial={preferences} />
        </CardContent>
      </Card>
    </div>
  );
}
