import { requireRole } from "@/features/auth/guards";
import { RoleSwitcher } from "@/components/dev/role-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { USER_ROLE_LABELS } from "@/types/enums";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const profile = await requireRole(["admin"]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Account and access settings.</p>
      </div>

      <RoleSwitcher
        currentRole={profile.role}
        isDeveloper={profile.is_developer}
      />

      <Card>
        <CardHeader>
          <CardTitle>Current Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Signed in as{" "}
            <span className="font-medium text-foreground">
              {profile.display_name || profile.username || "this account"}
            </span>{" "}
            with the <Badge variant="secondary">{USER_ROLE_LABELS[profile.role]}</Badge>{" "}
            role.
          </p>
          <p className="text-muted-foreground">
            Admin access is provisioned directly against the database and cannot
            be granted from the app.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
