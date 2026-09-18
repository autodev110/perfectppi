import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/features/auth/guards";
import { eventsEnabled } from "@/features/social/events";
import { getCommunityGroups } from "@/features/social/groups";
import { CommunityEventCreateForm } from "@/components/shared/community-event-create-form";
import { Button } from "@/components/ui/button";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: uiText("ui.create_event_perfectppi_47b1951be8") };

export default async function CreateCommunityEventPage() {
  const uiText = await getRequestTranslator();
  await requireRole(["consumer", "technician", "org_manager", "admin"]);
  if (!(await eventsEnabled())) redirect("/community/events");
  const groups = (await getCommunityGroups())
    .filter((group) => group.is_member && (group.posting_policy === "members" || group.membership_role !== "member"))
    .map((group) => ({ id: group.id, name: group.name }));
  return (
    <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3"><Link href="/community/events">{uiText("ui.events_8d14f6e72d")}</Link></Button>
        <h1 className="font-heading text-4xl font-extrabold tracking-tight">{uiText("ui.create_a_free_event_90cd08e9e5")}</h1>
        <p className="mb-8 mt-3 text-on-surface-variant">{uiText("ui.public_discovery_stays_approximate_exact_dir_80f7970b9e")}</p>
        <CommunityEventCreateForm groups={groups} />
      </div>
    </main>
  );
}
