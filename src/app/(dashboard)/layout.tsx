import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { PortalLayout } from "@/components/layout/portal-layout";
import { requireRole } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["consumer"]);

  return (
    <PortalLayout
      sidebar={<DashboardSidebar />}
      settingsHref="/dashboard/settings"
      profileHref="/dashboard/profile"
      messagesBase="/dashboard/messages"
    >
      {children}
    </PortalLayout>
  );
}
