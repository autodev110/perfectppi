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
import { createCommunityComment } from "@/features/community/actions";
import { getCommunityGroupPosts } from "@/features/community/queries";
import { requireRole } from "@/features/auth/guards";
import { getCommunityGroup } from "@/features/social/groups";
import { formatDate } from "@/lib/utils/formatting";
import { ArrowLeft, MessageSquare, Plus, ShieldCheck, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CommunityGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const viewer = await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const { slug } = await params;
  const group = await getCommunityGroup(slug);
  if (!group) notFound();
  const requestedPage = Number((await searchParams).page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const posts = await getCommunityGroupPosts(group.id, page, 20);

  return (
    <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3"><Link href="/community/groups"><ArrowLeft className="mr-2 h-4 w-4" />All groups</Link></Button>
        <section className="overflow-hidden rounded-[2rem] bg-surface-container-lowest shadow-sm ghost-border">
          <div className="h-24 bg-[radial-gradient(circle_at_15%_10%,rgba(18,122,110,0.28),transparent_36%),linear-gradient(120deg,rgba(12,24,36,0.96),rgba(40,74,78,0.9))]" />
          <div className="p-7 sm:p-9">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-2xl">
                <div className="mb-3 flex flex-wrap gap-2"><Badge>Public group</Badge><Badge variant="outline">Open to join</Badge></div>
                <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{group.name}</h1>
                <p className="mt-3 leading-relaxed text-on-surface-variant">{group.description}</p>
                <p className="mt-4 flex items-center gap-2 text-sm text-on-surface-variant"><Users className="h-4 w-4" />{group.member_count} member{group.member_count === 1 ? "" : "s"}</p>
              </div>
              <GroupMembershipButton groupId={group.id} initialJoined={group.is_member} owner={group.membership_role === "owner"} />
            </div>
            {group.rules.length ? (
              <div className="mt-7 rounded-2xl bg-surface-container p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4" />Group rules</h2>
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-on-surface-variant">{group.rules.map((rule) => <li key={rule}>{rule}</li>)}</ol>
              </div>
            ) : null}
          </div>
        </section>

        <div className="mt-8 flex items-center justify-between gap-4">
          <h2 className="font-heading text-2xl font-extrabold">Group posts</h2>
          {group.is_member ? <Button asChild><Link href={`/dashboard/posts/new?group=${group.slug}`}><Plus className="mr-2 h-4 w-4" />Post to group</Link></Button> : <p className="text-sm text-on-surface-variant">Join to post or comment</p>}
        </div>

        <div className="mt-5 space-y-5">
          {posts.length === 0 ? (
            <div className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border"><MessageSquare className="mx-auto mb-3 h-9 w-9 text-on-surface-variant/40" /><p className="font-semibold">No posts in this group yet.</p></div>
          ) : posts.map((post) => (
            <article key={post.id} className="rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
              <div className="flex items-start justify-between gap-4">
                <div><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{post.author?.display_name ?? post.author?.username ?? "PerfectPPI member"}</p>{post.post_type === "question" ? <Badge className="bg-teal/10 text-teal hover:bg-teal/10">{post.accepted_answer_comment_id ? "Solved" : "Question"}</Badge> : null}</div><p className="text-xs text-on-surface-variant">{formatDate(post.created_at)}</p></div>
                <div className="flex items-center gap-1">{post.author_id === viewer.id ? <Badge variant="outline">Your post</Badge> : <MemberSafetyActions profileId={post.author_id} compact />}{post.report_context ? <CommunityReportControl entityType="community_post" entityId={post.id} reportContext={post.report_context} /> : null}</div>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">{post.content}</p>
              {post.safety_notice ? <div className="mt-4"><SafetyNotice notice={post.safety_notice} /></div> : null}
              {post.media.length ? <div className="-mx-6 mt-5"><PostMediaCarousel media={post.media} /></div> : null}
              <div className="mt-4">
                <CommunityLikeButton postId={post.id} initialLiked={post.liked_by_viewer} initialCount={post.like_count} disabled={!post.can_like} />
              </div>
              {post.comments.length ? <div className="mt-5 space-y-2 border-t pt-4">{post.comments.map((comment) => <div key={comment.id} className={`flex items-start justify-between gap-3 rounded-xl bg-surface-container px-4 py-3 ${post.accepted_answer_comment_id === comment.id ? "ring-2 ring-teal/30" : ""}`}><div><p className="text-xs font-bold">{comment.author?.display_name ?? comment.author?.username ?? "Member"}</p>{post.post_type === "question" ? <AcceptedAnswerControl postId={post.id} commentId={comment.id} accepted={post.accepted_answer_comment_id === comment.id} canManage={post.can_manage_accepted_answer} ownResponse={comment.author_id === post.author_id} /> : null}<p className="mt-1 text-sm text-on-surface-variant">{comment.content}</p></div>{comment.report_context ? <CommunityReportControl entityType="community_comment" entityId={comment.id} reportContext={comment.report_context} compact /> : null}</div>)}</div> : null}
              {group.is_member ? <form action={createCommunityComment} className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="hidden" name="post_id" value={post.id} /><Textarea name="content" required maxLength={600} rows={2} placeholder="Add a comment..." /><Button type="submit" className="sm:self-end">Comment</Button></form> : null}
            </article>
          ))}
        </div>
        <nav className="mt-6 flex justify-between" aria-label="Group post pages">{page > 1 ? <Button asChild variant="outline"><Link href={`/community/groups/${group.slug}?page=${page - 1}`}>Previous</Link></Button> : <span />}{posts.length === 20 ? <Button asChild variant="outline"><Link href={`/community/groups/${group.slug}?page=${page + 1}`}>Next</Link></Button> : <span />}</nav>
      </div>
    </main>
  );
}
