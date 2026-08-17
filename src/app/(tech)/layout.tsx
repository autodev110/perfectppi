import { TechSidebar } from "@/components/layout/tech-sidebar";
import { PortalLayout } from "@/components/layout/portal-layout";
import { requireRole } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function TechLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Managers inspect too at smaller dealerships, and the deep link Perfect PPI
  // hands DealerSpace points here. Page data stays RLS-scoped to the caller.
  await requireRole(["technician", "org_manager"]);

  return (
    <PortalLayout
      sidebar={<TechSidebar />}
      settingsHref="/tech/profile"
      profileHref="/tech/profile"
      messagesBase="/tech/messages"
    >
      {children}
    </PortalLayout>
  );
}
