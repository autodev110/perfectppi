import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { PortalLayout } from "@/components/layout/portal-layout";
import { requireRole } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["admin"]);

  return (
    <PortalLayout
      sidebar={<AdminSidebar />}
      settingsHref="/admin"
      profileHref="/admin"
    >
      {children}
    </PortalLayout>
  );
}
