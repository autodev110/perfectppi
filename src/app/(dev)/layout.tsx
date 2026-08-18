import { DevSidebar } from "@/components/layout/dev-sidebar";
import { PortalLayout } from "@/components/layout/portal-layout";
import { requireDeveloper } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function DevLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Guarded on the grant, not on role: this portal is the way back for a
  // developer who is currently sitting in some other role.
  await requireDeveloper();

  return (
    <PortalLayout
      sidebar={<DevSidebar />}
      settingsHref="/dev"
      // The developer portal is only the switcher — it has no profile or inbox
      // of its own. Profile stays here; a notification click falls through to
      // the consumer inbox, whose requireRole bounces back to /dev. That is a
      // clean redirect, where a /dev/<conversationId> link would 404.
      profileHref="/dev"
      messagesBase="/dashboard/messages"
    >
      {children}
    </PortalLayout>
  );
}
