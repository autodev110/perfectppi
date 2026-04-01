import { OrgSidebar } from "@/components/layout/org-sidebar";
import { PortalLayout } from "@/components/layout/portal-layout";
import { requireRole } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function OrgLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["org_manager"]);

  return (
    <PortalLayout
      sidebar={<OrgSidebar />}
      settingsHref="/org/settings"
      profileHref="/org/profile"
    >
      {children}
    </PortalLayout>
  );
}
