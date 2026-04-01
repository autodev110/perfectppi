import { TechSidebar } from "@/components/layout/tech-sidebar";
import { PortalLayout } from "@/components/layout/portal-layout";
import { requireRole } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function TechLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["technician"]);

  return (
    <PortalLayout
      sidebar={<TechSidebar />}
      settingsHref="/tech/profile"
      profileHref="/tech/profile"
    >
      {children}
    </PortalLayout>
  );
}
