import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GroupMembershipButton } from "@/components/shared/group-membership-button";
import { requireRole } from "@/features/auth/guards";
import { getCommunityGroups, groupsEnabled } from "@/features/social/groups";
import { ArrowLeft, CarFront, Sparkles, Users } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Groups - PerfectPPI" };

function categoryLabel(category: string) {
  return category.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function CommunityGroupsPage() {
  await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const enabled = await groupsEnabled();
  const groups = enabled ? await getCommunityGroups() : [];

  return (
    <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3">
          <Link href="/community"><ArrowLeft className="mr-2 h-4 w-4" />Community</Link>
        </Button>
        <div className="mb-9 max-w-3xl">
          <Badge className="mb-4 bg-secondary-container text-on-secondary-container hover:bg-secondary-container">Curated Groups</Badge>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-on-surface sm:text-5xl">Find your corner of the garage.</h1>
          <p className="mt-4 text-on-surface-variant">Join staff-curated public groups for the cars and topics you care about. Group posting unlocks after you join.</p>
        </div>

        {!enabled ? (
          <div className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border">
            <Users className="mx-auto mb-3 h-10 w-10 text-on-surface-variant/40" />
            <p className="font-semibold">Groups are temporarily unavailable.</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border">
            <Users className="mx-auto mb-3 h-10 w-10 text-on-surface-variant/40" />
            <p className="font-semibold">Curated groups are being prepared.</p>
            <p className="mt-1 text-sm text-on-surface-variant">Check back as the first communities open.</p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {[...groups].sort((a, b) => Number(b.is_suggested) - Number(a.is_suggested) || a.name.localeCompare(b.name)).map((group) => (
              <article key={group.id} className="flex flex-col rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <CarFront className="h-6 w-6" />
                  </div>
                  {group.is_suggested ? <Badge variant="outline"><Sparkles className="mr-1 h-3 w-3" />Matches your Garage</Badge> : null}
                </div>
                <Link href={`/community/groups/${group.slug}`} className="group/link">
                  <h2 className="font-heading text-xl font-extrabold tracking-tight group-hover/link:text-primary">{group.name}</h2>
                </Link>
                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-on-surface-variant">{group.description}</p>
                <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                  <Badge variant="secondary">{categoryLabel(group.category)}</Badge>
                  <span>{group.member_count} member{group.member_count === 1 ? "" : "s"}</span>
                </div>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <Button asChild variant="ghost" className="-ml-3"><Link href={`/community/groups/${group.slug}`}>Open group</Link></Button>
                  <GroupMembershipButton groupId={group.id} initialJoined={group.is_member} owner={group.membership_role === "owner"} />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
