import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { getNotificationPreferences } from "@/features/notifications/preferences";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationPreferencesForm } from "@/components/shared/notification-preferences-form";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const me = await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const preferences = await getNotificationPreferences(me.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">Choose what reaches you in the app and on your phone.</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link href="/dashboard/settings">Settings</Link></Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationPreferencesForm initial={preferences} />
        </CardContent>
      </Card>
    </div>
  );
}
