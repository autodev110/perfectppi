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
import { CommunityAuthorEditor } from "@/components/shared/community-author-editor";
import { CommunityReplyForm } from "@/components/shared/community-reply-form";
import { createCommunityComment } from "@/features/community/actions";
import {
  getCommunityGroupPinnedPosts,
  getCommunityGroupPostsPage,
  searchCommunityGroupPostsPage,
  type CommunityFeedPost,
} from "@/features/community/queries";
import { getOptionalProfile } from "@/features/auth/guards";
import { getCommunityGroup } from "@/features/social/groups";
import { getGroupSharePreview, groupShareCard } from "@/features/share/previews";
import { ShareButton } from "@/components/shared/share-button";
import { sharePath } from "@/lib/share/links";
import { getGroupFaqEntriesPage, getGroupJoinRequests, getGroupMembersPage, getViewerGroupRole } from "@/features/social/group-tools";
import { GroupArchiveButton, GroupInviteForm, GroupJoinRequestControls, GroupMemberModerationMenu, GroupPostModerationMenu } from "@/components/shared/group-moderation-controls";
import { GroupFaqDeleteButton, GroupFaqForm, GroupRulesAcknowledgement, GroupSlowModeControl, SaveAcceptedAnswerToFaqButton } from "@/components/shared/group-quality-controls";
import { GROUP_JOIN_POLICY_LABELS, GROUP_VISIBILITY_LABELS } from "@/lib/social/group-options";
import { CommunityPoll } from "@/components/shared/community-poll";
import { PostDetailsCard } from "@/components/shared/post-details-card";
import { POST_TYPE_LABELS, type PostType } from "@/lib/community/post-types";
import { CommunityHelpfulButton } from "@/components/shared/community-helpful-button";
import { QuestionOutcomeControl } from "@/components/shared/question-outcome-control";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDate, getInitials } from "@/lib/utils/formatting";
import { ArrowLeft, BookOpen, Clock3, Lock, MessageSquare, Pin, Plus, Search, ShieldCheck, Users } from "lucide-react";
import { decodeGroupDirectoryCursor } from "@/features/community/group-cursor";
import { ExtendedReportControl } from "@/components/shared/extended-report-control";
import { recordProductEvent } from "@/features/analytics/product-events";

import { getRequestTranslator } from "@/lib/i18n/server";

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
  searchParams: Promise<{ q?: string; tab?: string; cursor?: string }>;
}) {
  const uiText = await getRequestTranslator();
  const viewer = await getOptionalProfile(["consumer", "technician", "org_manager", "admin"]);
  const { slug } = await params;
  if (!viewer) {
    // Signed-out share link: the public shell and a sign-in prompt.
    const preview = await getGroupSharePreview(slug);
    return (
      <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <Button asChild variant="ghost" className="mb-5 -ml-3"><Link href="/community"><ArrowLeft className="mr-2 h-4 w-4" />{uiText("ui.community_bb501d7877")}</Link></Button>
          {preview ? (
            <section className="rounded-[2rem] bg-surface-container-lowest p-8 shadow-sm ghost-border">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge>{preview.visibility === "private" ? uiText("ui.private_group_3f8fbf38b1") : uiText("ui.public_group_b99668e88a")}</Badge>
              </div>
              <h1 className="font-heading text-3xl font-extrabold tracking-tight">{preview.name}</h1>
              <p className="mt-3 leading-relaxed text-on-surface-variant">{preview.description}</p>
              <p className="mt-4 flex items-center gap-2 text-sm text-on-surface-variant"><Users className="h-4 w-4" />{preview.member_count}{uiText("ui.member_262e180603")}{preview.member_count === 1 ? "" : uiText("ui.s_043a718774")}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button asChild><Link href={`/login?redirect=${encodeURIComponent(sharePath({ kind: "group", slug: preview.slug }))}`}>{uiText("ui.sign_in_to_open_the_group_d8c602e14d")}</Link></Button>
                <Button asChild variant="outline"><Link href="/signup">{uiText("ui.join_perfectppi_b81135c87b")}</Link></Button>
                <ShareButton path={sharePath({ kind: "group", slug: preview.slug })} title={uiText("ui.perfectppi_groups_42fe350a47", { arg0: String(preview.name) })} />
              </div>
            </section>
          ) : (
            <section className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border">
              <Lock className="mx-auto mb-3 h-9 w-9 text-on-surface-variant/40" />
              <p className="font-semibold">{uiText("ui.this_group_isn_t_available_0afca0b8b1")}</p>
              <p className="mt-1 text-sm text-on-surface-variant">{uiText("ui.it_may_be_unlisted_archived_or_no_longer_exi_72116e13ec")}</p>
              <Button asChild className="mt-5"><Link href={`/login?redirect=${encodeURIComponent(sharePath({ kind: "group", slug }))}`}>{uiText("ui.sign_in_bfd402b2f6")}</Link></Button>
            </section>
          )}
        </div>
      </main>
    );
  }
  const group = await getCommunityGroup(slug);
  if (!group) notFound();
  const query = await searchParams;
  // Plan 34.1 discovery-to-join: once per group for a non-member.
  if (!group.is_member && !query.cursor && !query.tab) {
    await recordProductEvent({ profileId: viewer.id, eventName: "group_detail_viewed", surface: "community", dedupeId: group.id });
  }
  const search = (query.q ?? "").trim();
  const locked = !group.can_view_content;
  const showMembers = !locked && query.tab === "members";
  const viewerRole = await getViewerGroupRole(group.id);
  const canModerate = viewerRole === "owner" || viewerRole === "admin" || viewerRole === "moderator";
  const showRequests = canModerate && query.tab === "requests";
  const showFaq = !locked && query.tab === "faq";
  const showPosts = !locked && !showMembers && !showRequests && !showFaq;
  const postCursor = showPosts && !search ? decodeGroupDirectoryCursor(query.cursor, "posts", group.id) : null;
  const searchCursor = showPosts && search ? decodeGroupDirectoryCursor(query.cursor, "search", group.id, search) : null;
  const memberCursor = showMembers ? decodeGroupDirectoryCursor(query.cursor, "members", group.id) : null;
  const faqCursor = showFaq ? decodeGroupDirectoryCursor(query.cursor, "faq", group.id, search) : null;
  const [postPage, pinned, memberPage, requests, faqPage] = await Promise.all([
    !showPosts
      ? Promise.resolve({ items: [] as CommunityFeedPost[], nextCursor: null })
      : search
        ? searchCommunityGroupPostsPage(group.id, search, searchCursor, 20)
        : getCommunityGroupPostsPage(group.id, postCursor, 20),
    !showPosts || search || query.cursor ? Promise.resolve([] as CommunityFeedPost[]) : getCommunityGroupPinnedPosts(group.id),
    showMembers ? getGroupMembersPage(group.id, memberCursor, 50) : Promise.resolve({ items: [], nextCursor: null }),
    showRequests ? getGroupJoinRequests(group.id) : Promise.resolve([]),
    showFaq ? getGroupFaqEntriesPage(group.id, search, faqCursor, 50) : Promise.resolve({ items: [], nextCursor: null }),
  ]);
  const posts = postPage.items;
  const members = memberPage.items;
  const faqEntries = faqPage.items;
  const baseHref = `/community/groups/${group.slug}`;
  const activeNextCursor = showMembers ? memberPage.nextCursor : showFaq ? faqPage.nextCursor : postPage.nextCursor;
  const pageHref = (cursor?: string) => {
    const params = new URLSearchParams({
      ...(showMembers ? { tab: "members" } : {}),
      ...(showFaq ? { tab: "faq" } : {}),
      ...(search ? { q: search } : {}),
      ...(cursor ? { cursor } : {}),
    });
    const suffix = params.toString();
    return suffix ? `${baseHref}?${suffix}` : baseHref;
  };
  const postingRestricted = Boolean(group.posting_restricted_until && new Date(group.posting_restricted_until).getTime() > Date.now());
  const canPostByRole = group.posting_policy !== "moderators" || canModerate;

  return (
    <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3"><Link href="/community/groups"><ArrowLeft className="mr-2 h-4 w-4" />{uiText("ui.all_groups_1b492be772")}</Link></Button>
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
                  <Badge>{group.visibility === "public" ? uiText("ui.public_group_b99668e88a") : uiText("ui.group_a58532b230", { arg0: String(GROUP_VISIBILITY_LABELS[group.visibility].label) })}</Badge>
                  <Badge variant="outline">{group.join_policy === "open" ? uiText("ui.open_to_join_4a67556e53") : GROUP_JOIN_POLICY_LABELS[group.join_policy].label}</Badge>
                  {group.is_staff_curated ? <Badge variant="secondary">{uiText("ui.perfectppi_curated_e3716f386e")}</Badge> : null}
                  {group.posting_policy === "moderators" ? <Badge variant="outline">{uiText("ui.announcements_only_b5ca0a17d4")}</Badge> : null}
                  {group.slow_mode_seconds > 0 ? <Badge variant="outline"><Clock3 className="mr-1 h-3 w-3" />{uiText("ui.slow_mode_1efc091c01")}</Badge> : null}
                  {group.location_region ? <Badge variant="outline">{group.location_region}</Badge> : null}
                </div>
                <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{group.name}</h1>
                <p className="mt-3 leading-relaxed text-on-surface-variant">{group.description}</p>
                <p className="mt-4 flex items-center gap-2 text-sm text-on-surface-variant"><Users className="h-4 w-4" />{group.member_count}{uiText("ui.member_262e180603")}{group.member_count === 1 ? "" : uiText("ui.s_043a718774")}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <GroupMembershipButton groupId={group.id} status={group.membership_status} joinPolicy={group.join_policy} owner={group.membership_role === "owner"} />
                {group.visibility !== "unlisted" ? <ShareButton path={sharePath({ kind: "group", slug: group.slug })} title={uiText("ui.perfectppi_groups_42fe350a47", { arg0: String(group.name) })} /> : null}
                {group.created_by !== viewer.id ? <ExtendedReportControl entityType="group" entityId={group.id} label={uiText("ui.group_34ca0e7660")} /> : null}
                {viewerRole === "owner" || viewerRole === "admin" ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button asChild size="sm" variant="outline"><Link href={`/community/groups/${group.slug}/settings`}>{uiText("ui.group_settings_ba4062f844")}</Link></Button>
                    {viewerRole === "owner" ? <GroupArchiveButton slug={group.slug} /> : null}
                  </div>
                ) : null}
              </div>
            </div>
            {group.rules.length ? (
              <div className="mt-7 rounded-2xl bg-surface-container p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4" />{uiText("ui.group_rules_c9c61b1f01")}</h2>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-on-surface-variant">{group.rules.map((rule) => <li key={rule}>{rule}</li>)}</ol>
                {group.is_member && !group.rules_acknowledged ? <GroupRulesAcknowledgement slug={group.slug} /> : null}
              </div>
            ) : null}
          </div>
        </section>

        {viewerRole === "moderator" ? (
          <details className="mt-5 rounded-2xl bg-surface-container-lowest p-5 shadow-sm ghost-border">
            <summary className="cursor-pointer text-sm font-bold">{uiText("ui.moderator_posting_controls_1911f40fbf")}</summary>
            <div className="mt-4"><GroupSlowModeControl slug={group.slug} initialSeconds={group.slow_mode_seconds} /></div>
          </details>
        ) : null}

        {locked ? (
          <section className="mt-8 rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border" aria-label={uiText("ui.members_only_content_a5f7678d4b")}>
            <Lock className="mx-auto mb-3 h-9 w-9 text-on-surface-variant/40" />
            <p className="font-semibold">{uiText("ui.posts_and_members_are_visible_to_members_onl_e79544711d")}</p>
            <p className="mt-1 text-sm text-on-surface-variant">
              {group.membership_status === "requested"
                ? uiText("ui.your_request_is_waiting_for_a_moderator_c0e8d5e5f9")
                : group.membership_status === "invited"
                  ? uiText("ui.accept_the_invitation_above_to_see_what_memb_ec605690eb")
                  : group.join_policy === "invite_only"
                    ? uiText("ui.a_moderator_has_to_invite_you_652b6bb8a5")
                    : uiText("ui.ask_to_join_and_a_moderator_will_review_your_94602a0633")}
            </p>
          </section>
        ) : null}

        <div className={`mt-8 flex flex-wrap items-center justify-between gap-4 ${locked ? "hidden" : ""}`}>
          <nav className="flex gap-1 rounded-2xl bg-surface-container-low p-1.5 ghost-border" aria-label={uiText("ui.group_sections_9e32bdcb86")}>
            <Link href={baseHref} className={`rounded-xl px-4 py-2 text-sm font-bold ${showPosts ? "bg-surface-container-lowest shadow-sm" : "text-on-surface-variant"}`}>{uiText("ui.posts_a80811cf68")}</Link>
            <Link href={`${baseHref}?tab=members`} className={`rounded-xl px-4 py-2 text-sm font-bold ${showMembers ? "bg-surface-container-lowest shadow-sm" : "text-on-surface-variant"}`}>{uiText("ui.members_1044a4c056")}</Link>
            <Link href={`${baseHref}?tab=faq`} className={`rounded-xl px-4 py-2 text-sm font-bold ${showFaq ? "bg-surface-container-lowest shadow-sm" : "text-on-surface-variant"}`}>{uiText("ui.faq_dbc468a14b")}</Link>
            {canModerate && group.join_policy === "request_approval" ? (
              <Link href={`${baseHref}?tab=requests`} className={`rounded-xl px-4 py-2 text-sm font-bold ${showRequests ? "bg-surface-container-lowest shadow-sm" : "text-on-surface-variant"}`}>{uiText("ui.requests_ada27592c9")}{group.pending_request_count > 0 ? <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{group.pending_request_count}</span> : null}
              </Link>
            ) : null}
          </nav>
          {group.is_member && canPostByRole && group.rules_acknowledged && !postingRestricted
            ? <Button asChild><Link href={`/dashboard/posts/new?group=${group.slug}`}><Plus className="mr-2 h-4 w-4" />{uiText("ui.post_to_group_6b296cf353")}</Link></Button>
            : postingRestricted
              ? <p className="text-sm text-on-surface-variant">{uiText("ui.a_moderator_has_temporarily_paused_your_post_d8ebeccb1f")}</p>
              : group.is_member && !group.rules_acknowledged
                ? <p className="text-sm text-on-surface-variant">{uiText("ui.accept_the_latest_rules_before_posting_38373aaaf3")}</p>
            : group.is_member
              ? <p className="text-sm text-on-surface-variant">{uiText("ui.only_moderators_post_here_members_can_commen_1ac245afae")}</p>
              : <p className="text-sm text-on-surface-variant">{uiText("ui.join_to_post_or_comment_76e96fff15")}</p>}
        </div>

        {showRequests ? (
          <section className="mt-5 space-y-2" aria-label={uiText("ui.join_requests_a1321fc27d")}>
            {requests.length === 0 ? (
              <p className="rounded-3xl bg-surface-container-lowest p-8 text-center text-sm text-on-surface-variant ghost-border">{uiText("ui.no_pending_requests_4c963f0813")}</p>
            ) : requests.map((request) => (
              <div key={request.id} className="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest px-4 py-3 shadow-sm ghost-border sm:flex-row sm:items-center sm:justify-between">
                <Link href={request.username ? `/profile/${request.username}` : "#"} className="flex min-w-0 items-start gap-3">
                  <Avatar className="h-9 w-9"><AvatarImage src={request.avatar_url ?? ""} /><AvatarFallback className="text-xs">{getInitials(request.display_name ?? request.username ?? uiText("ui.u_a25513c7e0"))}</AvatarFallback></Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{request.display_name ?? request.username ?? uiText("ui.perfectppi_member_99bd607db6")}</span>
                    <span className="block text-xs text-on-surface-variant">{request.username ? uiText("ui.text_218d2e50d8", { arg0: String(request.username) }) : ""}{uiText("ui.asked_310b8de0c6")}{formatDate(request.requested_at)}</span>
                    {request.message ? <span className="mt-1 block text-sm text-on-surface-variant">&ldquo;{request.message}&rdquo;</span> : null}
                  </span>
                </Link>
                <GroupJoinRequestControls slug={group.slug} profileId={request.id} />
              </div>
            ))}
          </section>
        ) : null}

        {showMembers && canModerate ? (
          <section className="mt-5 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ghost-border" aria-label={uiText("ui.invite_a_member_f7042c2c2a")}>
            <h2 className="mb-2 text-sm font-bold">{uiText("ui.invite_a_member_f7042c2c2a")}</h2>
            <GroupInviteForm slug={group.slug} />
          </section>
        ) : null}

        {showMembers ? (
          <section className="mt-5 space-y-2" aria-label={uiText("ui.group_members_dd0fd917e7")}>
            {members.length === 0 ? (
              <p className="rounded-3xl bg-surface-container-lowest p-8 text-center text-sm text-on-surface-variant ghost-border">{uiText("ui.no_members_to_show_b6ea3d68b8")}</p>
            ) : members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container-lowest px-4 py-3 shadow-sm ghost-border">
                <Link href={member.username ? `/profile/${member.username}` : "#"} className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-9 w-9"><AvatarImage src={member.avatar_url ?? ""} /><AvatarFallback className="text-xs">{getInitials(member.display_name ?? member.username ?? uiText("ui.u_a25513c7e0"))}</AvatarFallback></Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{member.display_name ?? member.username ?? uiText("ui.perfectppi_member_99bd607db6")}</span>
                    <span className="block text-xs text-on-surface-variant">{member.username ? uiText("ui.text_218d2e50d8", { arg0: String(member.username) }) : ""}{member.role === "owner" ? uiText("ui.owner_4b1b8aa360") : member.role === "admin" ? uiText("ui.admin_c1c224b03c") : member.role === "moderator" ? uiText("ui.moderator_6748ec8b76") : uiText("ui.member_7c968fb71f")}{uiText("ui.since_35c3b1d1b0")}{formatDate(member.joined_at)}</span>
                  </span>
                </Link>
                {canModerate && member.id !== viewer.id ? (
                  <GroupMemberModerationMenu slug={group.slug} profileId={member.id} role={member.role} viewerRole={viewerRole as "owner" | "admin" | "moderator"} postingRestrictedUntil={member.posting_restricted_until} />
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {showPosts || showFaq ? (
          <form action={baseHref} method="get" role="search" className="mt-5 flex gap-2">
            {showFaq ? <input type="hidden" name="tab" value="faq" /> : null}
            <Input name="q" defaultValue={search} placeholder={showFaq ? uiText("ui.search_group_faq_128c177136") : uiText("ui.search_this_group_bbdc27166b")} maxLength={100} aria-label={showFaq ? uiText("ui.search_group_faq_128c177136") : uiText("ui.search_this_group_bbdc27166b")} />
            <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />{uiText("ui.search_49c266baaa")}</Button>
            {search ? <Button asChild variant="ghost"><Link href={showFaq ? `${baseHref}?tab=faq` : baseHref}>{uiText("ui.clear_83b12c2216")}</Link></Button> : null}
          </form>
        ) : null}

        {showFaq ? (
          <div className="mt-5 space-y-4">
            {canModerate ? <GroupFaqForm slug={group.slug} /> : null}
            {faqEntries.length === 0 ? (
              <div className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border"><BookOpen className="mx-auto mb-3 h-9 w-9 text-on-surface-variant/40" /><p className="font-semibold">{search ? uiText("ui.no_faq_resources_match_your_search_3a46464d5e") : uiText("ui.no_faq_resources_yet_db893123d0")}</p></div>
            ) : faqEntries.map((entry) => (
              <article key={entry.id} className="rounded-2xl bg-surface-container-lowest p-5 shadow-sm ghost-border">
                <div className="flex items-start justify-between gap-3"><h2 className="font-bold">{entry.question}</h2>{canModerate ? <GroupFaqDeleteButton slug={group.slug} entryId={entry.id} /> : null}</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">{entry.answer}</p>
                {entry.source_post_id ? <Link href={sharePath({ kind: "post", id: entry.source_post_id })} className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">{uiText("ui.view_original_question_cb8bc702b3")}</Link> : null}
              </article>
            ))}
          </div>
        ) : null}

        {showPosts && pinned.length > 0 ? (
          <section className="mt-5 space-y-3" aria-label={uiText("ui.pinned_posts_ab6cf31cf9")}>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-on-surface-variant"><Pin className="h-4 w-4" />{uiText("ui.pinned_f20c879465")}</h2>
            {pinned.map((post) => (
              <article key={post.id} className="rounded-[1.5rem] border-l-4 border-teal bg-surface-container-lowest p-5 shadow-sm ghost-border">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-bold">{post.author?.display_name ?? post.author?.username ?? uiText("ui.perfectppi_member_99bd607db6")}</p><p className="text-xs text-on-surface-variant">{formatDate(post.created_at)}</p></div>
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
            <div className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border"><Search className="mx-auto mb-3 h-9 w-9 text-on-surface-variant/40" /><p className="font-semibold">{uiText("ui.no_posts_match_f8718cff1b")}{search}&rdquo;.</p></div>
          ) : posts.length === 0 ? (
            <div className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border"><MessageSquare className="mx-auto mb-3 h-9 w-9 text-on-surface-variant/40" /><p className="font-semibold">{uiText("ui.no_posts_in_this_group_yet_b8ab92dd53")}</p></div>
          ) : posts.map((post) => (
            <article key={post.id} className="rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
              <div className="flex items-start justify-between gap-4">
                <div><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{post.author?.display_name ?? post.author?.username ?? uiText("ui.perfectppi_member_99bd607db6")}</p>{post.post_type === "question" ? <Badge className="bg-teal/10 text-teal hover:bg-teal/10">{post.accepted_answer_comment_id ? uiText("ui.solved_eb858c458b") : uiText("ui.question_289aff12b0")}</Badge> : post.post_type !== "general" && POST_TYPE_LABELS[post.post_type as PostType] ? <Badge className="bg-teal/10 text-teal hover:bg-teal/10">{POST_TYPE_LABELS[post.post_type as PostType].chip}</Badge> : null}</div><p className="text-xs text-on-surface-variant"><Link href={sharePath({ kind: "post", id: post.id })} className="hover:underline">{formatDate(post.created_at)}</Link>{post.edited_at ? <span title={uiText("ui.edited_b37cf770a2", { arg0: String(formatDate(post.edited_at)) })}>{uiText("ui.edited_e9d550c507")}</span> : null}</p></div>
                <div className="flex items-center gap-1">{post.author_id === viewer.id ? <Badge variant="outline">{uiText("ui.your_post_ee9ecff64a")}</Badge> : <MemberSafetyActions profileId={post.author_id} compact />}{post.report_context ? <CommunityReportControl entityType="community_post" entityId={post.id} reportContext={post.report_context} /> : null}{post.can_moderate_group ? <GroupPostModerationMenu slug={group.slug} postId={post.id} pinned={post.group_pinned} removed={false} /> : null}</div>
              </div>
              <CommunityMentionText content={post.content} mentions={post.mentions} className="mt-4 block whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant" />
              <PostDetailsCard postType={post.post_type as PostType} details={post.details} inspection={post.inspection} />
              {post.post_type === "question" ? <QuestionOutcomeControl postId={post.id} initialOutcome={post.question_outcome} hasAcceptedAnswer={Boolean(post.accepted_answer_comment_id)} canManage={post.can_manage_accepted_answer} /> : null}
              {canModerate && post.post_type === "question" && post.accepted_answer_comment_id ? <div className="mt-3"><SaveAcceptedAnswerToFaqButton slug={group.slug} postId={post.id} /></div> : null}
              {post.post_type === "poll" && post.poll ? <CommunityPoll postId={post.id} initial={post.poll} /> : null}
              {post.safety_notice ? <div className="mt-4"><SafetyNotice notice={post.safety_notice} /></div> : null}
              {post.media.length ? <div className="-mx-6 mt-5"><PostMediaCarousel media={post.media} /></div> : null}
              <div className="mt-4">
                <CommunityLikeButton postId={post.id} initialLiked={post.liked_by_viewer} initialCount={post.like_count} disabled={!post.can_like} />
              </div>
              {post.comments.length ? (
                <div className="mt-5 space-y-2 border-t pt-4">
                  {post.comments.map((comment) => {
                    const isReply = Boolean(comment.parent_comment_id);
                    const authorName = comment.author?.display_name ?? comment.author?.username ?? uiText("ui.member_7c968fb71f");
                    if (comment.removed) {
                      return <div key={comment.id} className="rounded-xl bg-surface-container px-4 py-3 text-xs italic text-on-surface-variant">{uiText("ui.comment_removed_f80ae1c83e")}</div>;
                    }
                    const text = <CommunityMentionText content={comment.content} mentions={comment.mentions} className="mt-1 block text-sm text-on-surface-variant" />;
                    return (
                      <div key={comment.id} className={`flex items-start justify-between gap-3 rounded-xl bg-surface-container px-4 py-3 ${post.accepted_answer_comment_id === comment.id ? "ring-2 ring-teal/30" : ""} ${isReply ? "ml-6 border-l-2 border-outline-variant/40 sm:ml-10" : ""}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold">
                            {authorName}
                            {comment.edited_at ? <span className="font-normal text-on-surface-variant" title={uiText("ui.edited_b37cf770a2", { arg0: String(formatDate(comment.edited_at)) })}>{uiText("ui.edited_e9d550c507")}</span> : null}
                          </p>
                          {post.post_type === "question" && !isReply ? <AcceptedAnswerControl postId={post.id} commentId={comment.id} accepted={post.accepted_answer_comment_id === comment.id} canManage={post.can_manage_accepted_answer} ownResponse={comment.author_id === post.author_id} /> : null}
                          {comment.can_edit ? <CommunityAuthorEditor entityType="comment" entityId={comment.id} initialContent={comment.content} canRemove={comment.can_remove}>{text}</CommunityAuthorEditor> : text}
                          {post.post_type === "question" && !isReply ? <CommunityHelpfulButton commentId={comment.id} initialHelpful={comment.helpful_by_viewer} initialCount={comment.helpful_count} disabled={!comment.can_mark_helpful} /> : null}
                          {group.is_member && !isReply ? <CommunityReplyForm postId={post.id} parentCommentId={comment.id} replyingTo={authorName} /> : null}
                        </div>
                        {comment.report_context ? <CommunityReportControl entityType="community_comment" entityId={comment.id} reportContext={comment.report_context} compact /> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {group.is_member ? <form action={createCommunityComment} className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="hidden" name="post_id" value={post.id} /><Textarea name="content" required maxLength={600} rows={2} placeholder={uiText("ui.add_a_comment_23c5f33170")} /><Button type="submit" className="sm:self-end">{uiText("ui.comment_44f5e3fbec")}</Button></form> : null}
            </article>
          ))}
        </div>
        {showPosts || showFaq || showMembers ? (
          <nav className="mt-6 flex justify-between" aria-label={showMembers ? uiText("ui.group_member_pages_6dd5fa6074") : showFaq ? uiText("ui.group_faq_pages_2fe42781e9") : uiText("ui.group_post_pages_bdd2a21a1d")}>
            {query.cursor ? <Button asChild variant="outline"><Link href={pageHref()}>{uiText("ui.back_to_first_results_58fbbfa217")}</Link></Button> : <span />}
            {activeNextCursor ? <Button asChild variant="outline"><Link href={pageHref(activeNextCursor)}>{uiText("ui.more_results_750ecbe1c8")}</Link></Button> : <span />}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
