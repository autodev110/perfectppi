import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/features/auth/guards";
import { eventsEnabled } from "@/features/social/events";
import { getCommunityGroups } from "@/features/social/groups";
import { CommunityEventCreateForm } from "@/components/shared/community-event-create-form";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create event - PerfectPPI" };

export default async function CreateCommunityEventPage() {
  await requireRole(["consumer", "technician", "org_manager", "admin"]);
  if (!(await eventsEnabled())) redirect("/community/events");
  const groups = (await getCommunityGroups())
    .filter((group) => group.is_member && (group.posting_policy === "members" || group.membership_role !== "member"))
    .map((group) => ({ id: group.id, name: group.name }));
  return (
    <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3"><Link href="/community/events">Events</Link></Button>
        <h1 className="font-heading text-4xl font-extrabold tracking-tight">Create a free event</h1>
        <p className="mb-8 mt-3 text-on-surface-variant">Public discovery stays approximate. Exact directions unlock only after a member marks Going.</p>
        <CommunityEventCreateForm groups={groups} />
      </div>
    </main>
  );
}
