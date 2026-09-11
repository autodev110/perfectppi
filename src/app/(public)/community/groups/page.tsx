import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GroupMembershipButton } from "@/components/shared/group-membership-button";
import { requireRole } from "@/features/auth/guards";
import { getCommunityGroups, getMyGroupInvitations, groupsEnabled } from "@/features/social/groups";
import { groupCreationEnabled } from "@/features/social/group-create";
import { GROUP_JOIN_POLICY_LABELS, GROUP_VISIBILITY_LABELS } from "@/lib/social/group-options";
import { ArrowLeft, CarFront, Sparkles, Users, Plus, ShieldCheck, Lock, EyeOff, Mail } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Groups - PerfectPPI" };

function categoryLabel(category: string) {
  return category.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function CommunityGroupsPage() {
  await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const [enabled, canCreate] = await Promise.all([groupsEnabled(), groupCreationEnabled()]);
  const [groups, invitations] = enabled ? await Promise.all([getCommunityGroups(), getMyGroupInvitations()]) : [[], []];

  return (
    <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3">
          <Link href="/community"><ArrowLeft className="mr-2 h-4 w-4" />Community</Link>
        </Button>
        <div className="mb-9 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <Badge className="mb-4 bg-secondary-container text-on-secondary-container hover:bg-secondary-container">Groups</Badge>
            <h1 className="font-heading text-4xl font-extrabold tracking-tight text-on-surface sm:text-5xl">Find your corner of the garage.</h1>
            <p className="mt-4 text-on-surface-variant">Groups for the cars and topics you care about — curated by PerfectPPI or started by members. Public groups are open to read; private groups share posts with members only.</p>
          </div>
          {canCreate ? (
            <Button asChild className="h-12 rounded-xl px-6"><Link href="/community/groups/new"><Plus className="mr-2 h-4 w-4" />Create group</Link></Button>
          ) : null}
        </div>

        {invitations.length > 0 ? (
          <section className="mb-8 rounded-[1.5rem] bg-primary/5 p-6 ghost-border" aria-label="Group invitations">
            <h2 className="flex items-center gap-2 font-heading text-lg font-extrabold"><Mail className="h-5 w-5 text-primary" />You&rsquo;re invited</h2>
            <ul className="mt-4 space-y-3">
              {invitations.map((invitation) => (
                <li key={invitation.group_id} className="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/community/groups/${invitation.slug}`} className="font-bold hover:text-primary">{invitation.name}</Link>
                    <p className="text-xs text-on-surface-variant">{invitation.invited_by_label ?? "A moderator"} invited you · {GROUP_VISIBILITY_LABELS[invitation.visibility].label} group</p>
                  </div>
                  <GroupMembershipButton groupId={invitation.group_id} status="invited" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

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
                  {group.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={group.avatar_url} alt="" className="h-12 w-12 rounded-2xl object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <CarFront className="h-6 w-6" />
                    </div>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    {group.visibility === "private" ? <Badge variant="outline"><Lock className="mr-1 h-3 w-3" />Private</Badge> : null}
                    {group.visibility === "unlisted" ? <Badge variant="outline"><EyeOff className="mr-1 h-3 w-3" />Unlisted</Badge> : null}
                    {group.is_staff_curated ? <Badge variant="secondary"><ShieldCheck className="mr-1 h-3 w-3" />PerfectPPI curated</Badge> : null}
                    {group.is_suggested ? <Badge variant="outline"><Sparkles className="mr-1 h-3 w-3" />Matches your Garage</Badge> : null}
                    {group.pending_request_count > 0 ? <Badge>{group.pending_request_count} request{group.pending_request_count === 1 ? "" : "s"}</Badge> : null}
                  </div>
                </div>
                <Link href={`/community/groups/${group.slug}`} className="group/link">
                  <h2 className="font-heading text-xl font-extrabold tracking-tight group-hover/link:text-primary">{group.name}</h2>
                </Link>
                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-on-surface-variant">{group.description}</p>
                <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                  <Badge variant="secondary">{categoryLabel(group.category)}</Badge>
                  <span>{group.member_count} member{group.member_count === 1 ? "" : "s"}</span>
                  {group.location_region ? <span>· {group.location_region}</span> : null}
                  {group.join_policy !== "open" ? <span>· {GROUP_JOIN_POLICY_LABELS[group.join_policy].label}</span> : null}
                  {group.posting_policy === "moderators" ? <span>· Announcements only</span> : null}
                </div>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <Button asChild variant="ghost" className="-ml-3"><Link href={`/community/groups/${group.slug}`}>Open group</Link></Button>
                  <GroupMembershipButton groupId={group.id} status={group.membership_status} joinPolicy={group.join_policy} owner={group.membership_role === "owner"} />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
