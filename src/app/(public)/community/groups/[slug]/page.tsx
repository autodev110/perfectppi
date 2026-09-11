import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GroupMembershipButton } from "@/components/shared/group-membership-button";
import { CommunityReportControl } from "@/components/shared/community-report-control";
import { MemberSafetyActions } from "@/components/shared/member-safety-actions";
import { SafetyNotice } from "@/components/shared/safety-notice";
import { PostMediaCarousel } from "@/components/shared/post-media-carousel";
import { AcceptedAnswerControl } from "@/components/shared/accepted-answer-control";
import { CommunityLikeButton } from "@/components/shared/community-like-button";
import { CommunityMentionText } from "@/components/shared/community-mention-text";
import { createCommunityComment } from "@/features/community/actions";
import {
  getCommunityGroupPinnedPosts,
  getCommunityGroupPosts,
  searchCommunityGroupPosts,
  type CommunityFeedPost,
} from "@/features/community/queries";
import { getOptionalProfile } from "@/features/auth/guards";
import { getCommunityGroup } from "@/features/social/groups";
import { getGroupSharePreview, groupShareCard } from "@/features/share/previews";
import { ShareButton } from "@/components/shared/share-button";
import { sharePath } from "@/lib/share/links";
import { getGroupJoinRequests, getGroupMembers, getViewerGroupRole } from "@/features/social/group-tools";
import { GroupArchiveButton, GroupInviteForm, GroupJoinRequestControls, GroupMemberModerationMenu, GroupPostModerationMenu } from "@/components/shared/group-moderation-controls";
import { GROUP_JOIN_POLICY_LABELS, GROUP_VISIBILITY_LABELS } from "@/lib/social/group-options";
import { CommunityPoll } from "@/components/shared/community-poll";
import { PostDetailsCard } from "@/components/shared/post-details-card";
import { POST_TYPE_LABELS, type PostType } from "@/lib/community/post-types";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDate, getInitials } from "@/lib/utils/formatting";
import { ArrowLeft, Lock, MessageSquare, Pin, Plus, Search, ShieldCheck, Users } from "lucide-react";

export const dynamic = "force-dynamic";

// Share cards see the shell of public and private groups only (plan 15.4);
// unlisted groups get the neutral card.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const card = await groupShareCard(slug);
  return {
    title: card.title,
    description: card.description,
    openGraph: { title: card.title, description: card.description, url: card.path },
    robots: card.available ? undefined : { index: false },
  };
}

export default async function CommunityGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; q?: string; tab?: string }>;
}) {
  const viewer = await getOptionalProfile(["consumer", "technician", "org_manager", "admin"]);
  const { slug } = await params;
  if (!viewer) {
    // Signed-out share link: the public shell and a sign-in prompt.
    const preview = await getGroupSharePreview(slug);
    return (
      <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <Button asChild variant="ghost" className="mb-5 -ml-3"><Link href="/community"><ArrowLeft className="mr-2 h-4 w-4" />Community</Link></Button>
          {preview ? (
            <section className="rounded-[2rem] bg-surface-container-lowest p-8 shadow-sm ghost-border">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge>{preview.visibility === "private" ? "Private group" : "Public group"}</Badge>
              </div>
              <h1 className="font-heading text-3xl font-extrabold tracking-tight">{preview.name}</h1>
              <p className="mt-3 leading-relaxed text-on-surface-variant">{preview.description}</p>
              <p className="mt-4 flex items-center gap-2 text-sm text-on-surface-variant"><Users className="h-4 w-4" />{preview.member_count} member{preview.member_count === 1 ? "" : "s"}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button asChild><Link href={`/login?redirect=${encodeURIComponent(sharePath({ kind: "group", slug: preview.slug }))}`}>Sign in to open the group</Link></Button>
                <Button asChild variant="outline"><Link href="/signup">Join PerfectPPI</Link></Button>
                <ShareButton path={sharePath({ kind: "group", slug: preview.slug })} title={`${preview.name} · PerfectPPI Groups`} />
              </div>
            </section>
          ) : (
            <section className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border">
              <Lock className="mx-auto mb-3 h-9 w-9 text-on-surface-variant/40" />
              <p className="font-semibold">This group isn&rsquo;t available.</p>
              <p className="mt-1 text-sm text-on-surface-variant">It may be unlisted, archived, or no longer exist. Sign in if you were invited.</p>
              <Button asChild className="mt-5"><Link href={`/login?redirect=${encodeURIComponent(sharePath({ kind: "group", slug }))}`}>Sign in</Link></Button>
            </section>
          )}
        </div>
      </main>
    );
  }
  const group = await getCommunityGroup(slug);
  if (!group) notFound();
  const query = await searchParams;
  const requestedPage = Number(query.page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const search = (query.q ?? "").trim();
  const locked = !group.can_view_content;
  const showMembers = !locked && query.tab === "members";
  const viewerRole = await getViewerGroupRole(group.id);
  const canModerate = viewerRole === "owner" || viewerRole === "moderator";
  const showRequests = canModerate && query.tab === "requests";
  const showPosts = !locked && !showMembers && !showRequests;
  const [posts, pinned, members, requests] = await Promise.all([
    !showPosts ? Promise.resolve([] as CommunityFeedPost[]) : search ? searchCommunityGroupPosts(group.id, search, page, 20) : getCommunityGroupPosts(group.id, page, 20),
    !showPosts || search || page > 1 ? Promise.resolve([] as CommunityFeedPost[]) : getCommunityGroupPinnedPosts(group.id),
    showMembers ? getGroupMembers(group.id, 1, 100) : Promise.resolve([]),
    showRequests ? getGroupJoinRequests(group.id) : Promise.resolve([]),
  ]);
  const baseHref = `/community/groups/${group.slug}`;
  const pageHref = (nextPage: number) => `${baseHref}?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(nextPage) })}`;

  return (
    <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3"><Link href="/community/groups"><ArrowLeft className="mr-2 h-4 w-4" />All groups</Link></Button>
        <section className="overflow-hidden rounded-[2rem] bg-surface-container-lowest shadow-sm ghost-border">
          {group.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={group.cover_url} alt="" className="h-40 w-full object-cover sm:h-56" />
          ) : (
            <div className="h-24 bg-[radial-gradient(circle_at_15%_10%,rgba(18,122,110,0.28),transparent_36%),linear-gradient(120deg,rgba(12,24,36,0.96),rgba(40,74,78,0.9))]" />
          )}
          <div className="p-7 sm:p-9">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-2xl">
                {group.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={group.avatar_url} alt="" className="-mt-16 mb-4 h-20 w-20 rounded-2xl border-4 border-surface-container-lowest object-cover shadow-md sm:-mt-20 sm:h-24 sm:w-24" />
                ) : null}
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge>{group.visibility === "public" ? "Public group" : `${GROUP_VISIBILITY_LABELS[group.visibility].label} group`}</Badge>
                  <Badge variant="outline">{group.join_policy === "open" ? "Open to join" : GROUP_JOIN_POLICY_LABELS[group.join_policy].label}</Badge>
                  {group.is_staff_curated ? <Badge variant="secondary">PerfectPPI curated</Badge> : null}
                  {group.posting_policy === "moderators" ? <Badge variant="outline">Announcements only</Badge> : null}
                  {group.location_region ? <Badge variant="outline">{group.location_region}</Badge> : null}
                </div>
                <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{group.name}</h1>
                <p className="mt-3 leading-relaxed text-on-surface-variant">{group.description}</p>
                <p className="mt-4 flex items-center gap-2 text-sm text-on-surface-variant"><Users className="h-4 w-4" />{group.member_count} member{group.member_count === 1 ? "" : "s"}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <GroupMembershipButton groupId={group.id} status={group.membership_status} joinPolicy={group.join_policy} owner={group.membership_role === "owner"} />
                {group.visibility !== "unlisted" ? <ShareButton path={sharePath({ kind: "group", slug: group.slug })} title={`${group.name} · PerfectPPI Groups`} /> : null}
                {viewerRole === "owner" || viewerRole === "admin" ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button asChild size="sm" variant="outline"><Link href={`/community/groups/${group.slug}/settings`}>Group settings</Link></Button>
                    {viewerRole === "owner" ? <GroupArchiveButton slug={group.slug} /> : null}
                  </div>
                ) : null}
              </div>
            </div>
            {group.rules.length ? (
              <div className="mt-7 rounded-2xl bg-surface-container p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4" />Group rules</h2>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-on-surface-variant">{group.rules.map((rule) => <li key={rule}>{rule}</li>)}</ol>
              </div>
            ) : null}
          </div>
        </section>

        {locked ? (
          <section className="mt-8 rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border" aria-label="Members-only content">
            <Lock className="mx-auto mb-3 h-9 w-9 text-on-surface-variant/40" />
            <p className="font-semibold">Posts and members are visible to members only.</p>
            <p className="mt-1 text-sm text-on-surface-variant">
              {group.membership_status === "requested"
                ? "Your request is waiting for a moderator."
                : group.membership_status === "invited"
                  ? "Accept the invitation above to see what members are sharing."
                  : group.join_policy === "invite_only"
                    ? "A moderator has to invite you."
                    : "Ask to join and a moderator will review your request."}
            </p>
          </section>
        ) : null}

        <div className={`mt-8 flex flex-wrap items-center justify-between gap-4 ${locked ? "hidden" : ""}`}>
          <nav className="flex gap-1 rounded-2xl bg-surface-container-low p-1.5 ghost-border" aria-label="Group sections">
            <Link href={baseHref} className={`rounded-xl px-4 py-2 text-sm font-bold ${showPosts ? "bg-surface-container-lowest shadow-sm" : "text-on-surface-variant"}`}>Posts</Link>
            <Link href={`${baseHref}?tab=members`} className={`rounded-xl px-4 py-2 text-sm font-bold ${showMembers ? "bg-surface-container-lowest shadow-sm" : "text-on-surface-variant"}`}>Members</Link>
            {canModerate && group.join_policy === "request_approval" ? (
              <Link href={`${baseHref}?tab=requests`} className={`rounded-xl px-4 py-2 text-sm font-bold ${showRequests ? "bg-surface-container-lowest shadow-sm" : "text-on-surface-variant"}`}>
                Requests{group.pending_request_count > 0 ? <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{group.pending_request_count}</span> : null}
              </Link>
            ) : null}
          </nav>
          {group.is_member && (group.posting_policy !== "moderators" || canModerate)
            ? <Button asChild><Link href={`/dashboard/posts/new?group=${group.slug}`}><Plus className="mr-2 h-4 w-4" />Post to group</Link></Button>
            : group.is_member
              ? <p className="text-sm text-on-surface-variant">Only moderators post here; members can comment</p>
              : <p className="text-sm text-on-surface-variant">Join to post or comment</p>}
        </div>

        {showRequests ? (
          <section className="mt-5 space-y-2" aria-label="Join requests">
            {requests.length === 0 ? (
              <p className="rounded-3xl bg-surface-container-lowest p-8 text-center text-sm text-on-surface-variant ghost-border">No pending requests.</p>
            ) : requests.map((request) => (
              <div key={request.id} className="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest px-4 py-3 shadow-sm ghost-border sm:flex-row sm:items-center sm:justify-between">
                <Link href={request.username ? `/profile/${request.username}` : "#"} className="flex min-w-0 items-start gap-3">
                  <Avatar className="h-9 w-9"><AvatarImage src={request.avatar_url ?? ""} /><AvatarFallback className="text-xs">{getInitials(request.display_name ?? request.username ?? "U")}</AvatarFallback></Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{request.display_name ?? request.username ?? "PerfectPPI member"}</span>
                    <span className="block text-xs text-on-surface-variant">{request.username ? `@${request.username} · ` : ""}asked {formatDate(request.requested_at)}</span>
                    {request.message ? <span className="mt-1 block text-sm text-on-surface-variant">&ldquo;{request.message}&rdquo;</span> : null}
                  </span>
                </Link>
                <GroupJoinRequestControls slug={group.slug} profileId={request.id} />
              </div>
            ))}
          </section>
        ) : null}

        {showMembers && canModerate ? (
          <section className="mt-5 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ghost-border" aria-label="Invite a member">
            <h2 className="mb-2 text-sm font-bold">Invite a member</h2>
            <GroupInviteForm slug={group.slug} />
          </section>
        ) : null}

        {showMembers ? (
          <section className="mt-5 space-y-2" aria-label="Group members">
            {members.length === 0 ? (
              <p className="rounded-3xl bg-surface-container-lowest p-8 text-center text-sm text-on-surface-variant ghost-border">No members to show.</p>
            ) : members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container-lowest px-4 py-3 shadow-sm ghost-border">
                <Link href={member.username ? `/profile/${member.username}` : "#"} className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-9 w-9"><AvatarImage src={member.avatar_url ?? ""} /><AvatarFallback className="text-xs">{getInitials(member.display_name ?? member.username ?? "U")}</AvatarFallback></Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{member.display_name ?? member.username ?? "PerfectPPI member"}</span>
                    <span className="block text-xs text-on-surface-variant">{member.username ? `@${member.username} · ` : ""}{member.role === "owner" ? "Owner" : member.role === "admin" ? "Admin" : member.role === "moderator" ? "Moderator" : "Member"} · since {formatDate(member.joined_at)}</span>
                  </span>
                </Link>
                {canModerate && member.id !== viewer.id ? (
                  <GroupMemberModerationMenu slug={group.slug} profileId={member.id} role={member.role} viewerRole={viewerRole as "owner" | "admin" | "moderator"} />
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {showPosts ? (
          <form action={baseHref} method="get" role="search" className="mt-5 flex gap-2">
            <Input name="q" defaultValue={search} placeholder="Search this group" maxLength={100} aria-label="Search this group" />
            <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />Search</Button>
            {search ? <Button asChild variant="ghost"><Link href={baseHref}>Clear</Link></Button> : null}
          </form>
        ) : null}

        {showPosts && pinned.length > 0 ? (
          <section className="mt-5 space-y-3" aria-label="Pinned posts">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-on-surface-variant"><Pin className="h-4 w-4" />Pinned</h2>
            {pinned.map((post) => (
              <article key={post.id} className="rounded-[1.5rem] border-l-4 border-teal bg-surface-container-lowest p-5 shadow-sm ghost-border">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-bold">{post.author?.display_name ?? post.author?.username ?? "PerfectPPI member"}</p><p className="text-xs text-on-surface-variant">{formatDate(post.created_at)}</p></div>
                  {canModerate ? <GroupPostModerationMenu slug={group.slug} postId={post.id} pinned removed={false} /> : null}
                </div>
                <CommunityMentionText content={post.content} mentions={post.mentions} className="mt-3 block whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant" />
                {post.safety_notice ? <div className="mt-3"><SafetyNotice notice={post.safety_notice} compact /></div> : null}
              </article>
            ))}
          </section>
        ) : null}

        <div className={`mt-5 space-y-5 ${!showPosts ? "hidden" : ""}`}>
          {search && posts.length === 0 ? (
            <div className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border"><Search className="mx-auto mb-3 h-9 w-9 text-on-surface-variant/40" /><p className="font-semibold">No posts match &ldquo;{search}&rdquo;.</p></div>
          ) : posts.length === 0 ? (
            <div className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border"><MessageSquare className="mx-auto mb-3 h-9 w-9 text-on-surface-variant/40" /><p className="font-semibold">No posts in this group yet.</p></div>
          ) : posts.map((post) => (
            <article key={post.id} className="rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
              <div className="flex items-start justify-between gap-4">
                <div><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{post.author?.display_name ?? post.author?.username ?? "PerfectPPI member"}</p>{post.post_type === "question" ? <Badge className="bg-teal/10 text-teal hover:bg-teal/10">{post.accepted_answer_comment_id ? "Solved" : "Question"}</Badge> : post.post_type !== "general" && POST_TYPE_LABELS[post.post_type as PostType] ? <Badge className="bg-teal/10 text-teal hover:bg-teal/10">{POST_TYPE_LABELS[post.post_type as PostType].chip}</Badge> : null}</div><p className="text-xs text-on-surface-variant"><Link href={sharePath({ kind: "post", id: post.id })} className="hover:underline">{formatDate(post.created_at)}</Link></p></div>
                <div className="flex items-center gap-1">{post.author_id === viewer.id ? <Badge variant="outline">Your post</Badge> : <MemberSafetyActions profileId={post.author_id} compact />}{post.report_context ? <CommunityReportControl entityType="community_post" entityId={post.id} reportContext={post.report_context} /> : null}{post.can_moderate_group ? <GroupPostModerationMenu slug={group.slug} postId={post.id} pinned={post.group_pinned} removed={false} /> : null}</div>
              </div>
              <CommunityMentionText content={post.content} mentions={post.mentions} className="mt-4 block whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant" />
              <PostDetailsCard postType={post.post_type as PostType} details={post.details} inspection={post.inspection} />
              {post.post_type === "poll" && post.poll ? <CommunityPoll postId={post.id} initial={post.poll} /> : null}
              {post.safety_notice ? <div className="mt-4"><SafetyNotice notice={post.safety_notice} /></div> : null}
              {post.media.length ? <div className="-mx-6 mt-5"><PostMediaCarousel media={post.media} /></div> : null}
              <div className="mt-4">
                <CommunityLikeButton postId={post.id} initialLiked={post.liked_by_viewer} initialCount={post.like_count} disabled={!post.can_like} />
              </div>
              {post.comments.length ? <div className="mt-5 space-y-2 border-t pt-4">{post.comments.map((comment) => <div key={comment.id} className={`flex items-start justify-between gap-3 rounded-xl bg-surface-container px-4 py-3 ${post.accepted_answer_comment_id === comment.id ? "ring-2 ring-teal/30" : ""}`}><div><p className="text-xs font-bold">{comment.author?.display_name ?? comment.author?.username ?? "Member"}</p>{post.post_type === "question" ? <AcceptedAnswerControl postId={post.id} commentId={comment.id} accepted={post.accepted_answer_comment_id === comment.id} canManage={post.can_manage_accepted_answer} ownResponse={comment.author_id === post.author_id} /> : null}<CommunityMentionText content={comment.content} mentions={comment.mentions} className="mt-1 block text-sm text-on-surface-variant" /></div>{comment.report_context ? <CommunityReportControl entityType="community_comment" entityId={comment.id} reportContext={comment.report_context} compact /> : null}</div>)}</div> : null}
              {group.is_member ? <form action={createCommunityComment} className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="hidden" name="post_id" value={post.id} /><Textarea name="content" required maxLength={600} rows={2} placeholder="Add a comment..." /><Button type="submit" className="sm:self-end">Comment</Button></form> : null}
            </article>
          ))}
        </div>
        {showPosts ? <nav className="mt-6 flex justify-between" aria-label="Group post pages">{page > 1 ? <Button asChild variant="outline"><Link href={pageHref(page - 1)}>Previous</Link></Button> : <span />}{posts.length === 20 ? <Button asChild variant="outline"><Link href={pageHref(page + 1)}>Next</Link></Button> : <span />}</nav> : null}
      </div>
    </main>
  );
}
