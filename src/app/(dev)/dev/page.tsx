import { requireDeveloper } from "@/features/auth/guards";
import { RoleSwitcher } from "@/components/dev/role-switcher";

export const dynamic = "force-dynamic";

export default async function DevRoleSwitcherPage() {
  const profile = await requireDeveloper();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Developer</h1>
        <p className="text-muted-foreground">
          Switch this account into any role to see the product as that role.
        </p>
      </div>

      <RoleSwitcher currentRole={profile.role} isDeveloper={profile.is_developer} />

      <p className="text-xs text-muted-foreground">
        The same switcher appears in the settings page of every portal, so you
        can move between roles without coming back here first.
      </p>
    </div>
  );
}
