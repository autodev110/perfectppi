import Link from "next/link";
import { createCommunityComment } from "@/features/community/actions";
import type { CommunityFeedPost } from "@/features/community/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate, formatMileage, getInitials } from "@/lib/utils/formatting";
import { Car, MessageSquare, Tag } from "lucide-react";
import { PostMediaCarousel } from "@/components/shared/post-media-carousel";
import { MemberSafetyActions } from "@/components/shared/member-safety-actions";
import { SafetyNotice } from "@/components/shared/safety-notice";
import { CommunityReportControl } from "@/components/shared/community-report-control";
import { AcceptedAnswerControl } from "@/components/shared/accepted-answer-control";
import { CommunityLikeButton } from "@/components/shared/community-like-button";
import { CommunitySaveButton } from "@/components/shared/community-save-button";
import { CommunityMentionText } from "@/components/shared/community-mention-text";
import { ShareButton } from "@/components/shared/share-button";
import { sharePath } from "@/lib/share/links";
import { CommunityPoll } from "@/components/shared/community-poll";
import { PostDetailsCard } from "@/components/shared/post-details-card";
import { POST_TYPE_LABELS, type PostType } from "@/lib/community/post-types";
import { CommunityHelpfulButton } from "@/components/shared/community-helpful-button";
import { QuestionOutcomeControl } from "@/components/shared/question-outcome-control";
import { SavedCollectionButton } from "@/components/shared/saved-collection-button";
import { CommunityFeedMuteMenu } from "@/components/shared/community-feed-mute-menu";
import { CommunityAuthorEditor } from "@/components/shared/community-author-editor";
import { CommunityReplyForm } from "@/components/shared/community-reply-form";
import { t as uiText } from "@/lib/i18n";

function getVehicleName(vehicle: { year: number | null; make: string | null; model: string | null; trim: string | null } | null) {
  return [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ");
}

// One Community post as rendered in the feed and on its own page
// (/community/posts/<id>, the share link). Server component: the comment
// form posts to the server action directly.
export function CommunityPostArticle({ post, viewerId, linkToPost = true }: { post: CommunityFeedPost; viewerId: string; linkToPost?: boolean }) {
  const vehicleName = getVehicleName(post.vehicle);
  const primaryMedia = post.vehicle?.vehicle_media?.find((media) => media.is_primary) ?? post.vehicle?.vehicle_media?.[0];
  const liveCommentCount = post.comments.filter((comment) => !comment.removed).length;

  return (
    <article key={post.id} id={`post-${post.id}`} className="overflow-hidden rounded-[1.5rem] bg-surface-container-lowest shadow-sm ghost-border">
      <div className="p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={post.author?.avatar_url ?? ""} />
              <AvatarFallback className="text-xs">
                {getInitials(post.author?.display_name ?? post.author?.username ?? uiText("ui.u_a25513c7e0"))}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-bold text-on-surface">
                {post.author?.display_name ?? post.author?.username ?? uiText("ui.perfectppi_user_77df1ce619")}
              </p>
              <p className="text-xs text-on-surface-variant">
                {linkToPost ? <Link href={sharePath({ kind: "post", id: post.id })} className="hover:underline">{formatDate(post.created_at)}</Link> : formatDate(post.created_at)}
                {post.edited_at ? <span title={uiText("ui.edited_b37cf770a2", { arg0: String(formatDate(post.edited_at)) })}>{uiText("ui.edited_e9d550c507")}</span> : null}
              </p>
              {post.group ? (
                <Link href={`/community/groups/${post.group.slug}`} className="text-xs font-semibold text-primary hover:underline">
                  {post.group.name}
                </Link>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {post.post_type === "question" ? (
              <Badge className="bg-teal/10 text-teal hover:bg-teal/10">
                {post.accepted_answer_comment_id ? uiText("ui.solved_eb858c458b") : uiText("ui.question_289aff12b0")}
              </Badge>
            ) : post.post_type !== "general" && POST_TYPE_LABELS[post.post_type as PostType] ? (
              <Badge className="bg-teal/10 text-teal hover:bg-teal/10">{POST_TYPE_LABELS[post.post_type as PostType].chip}</Badge>
            ) : null}
            <Badge variant="outline" className="rounded-full capitalize">{post.audience}</Badge>
            {post.author_id !== viewerId ? (
              <CommunityFeedMuteMenu
                group={post.group ? { id: post.group.id, name: post.group.name } : null}
                postType={post.post_type as PostType}
                vehicle={post.vehicle ? { make: post.vehicle.make, model: post.vehicle.model } : null}
              />
            ) : null}
            {post.author_id !== viewerId ? <MemberSafetyActions profileId={post.author_id} compact /> : null}
            {post.report_context ? (
              <CommunityReportControl entityType="community_post" entityId={post.id} reportContext={post.report_context} />
            ) : null}
          </div>
        </div>

        {post.can_edit ? (
          <CommunityAuthorEditor entityType="post" entityId={post.id} initialContent={post.content}>
            <CommunityMentionText
              content={post.content}
              mentions={post.mentions}
              className="block whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant"
            />
          </CommunityAuthorEditor>
        ) : (
          <CommunityMentionText
            content={post.content}
            mentions={post.mentions}
            className="block whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant"
          />
        )}
        <PostDetailsCard postType={post.post_type as PostType} details={post.details} inspection={post.inspection} />
        {post.post_type === "question" ? (
          <QuestionOutcomeControl
            postId={post.id}
            initialOutcome={post.question_outcome}
            hasAcceptedAnswer={Boolean(post.accepted_answer_comment_id)}
            canManage={post.can_manage_accepted_answer}
          />
        ) : null}
        {post.post_type === "poll" && post.poll ? <CommunityPoll postId={post.id} initial={post.poll} /> : null}
        {post.safety_notice ? (
          <div className="mt-4">
            <SafetyNotice notice={post.safety_notice} />
          </div>
        ) : null}
        {post.collapsed_repost_count > 0 ? (
          <p className="mt-4 rounded-xl bg-surface-container px-3 py-2 text-xs text-on-surface-variant">
            {post.collapsed_repost_count}{uiText("ui.repetitive_repost_c3e6f21b61")}{post.collapsed_repost_count === 1 ? "" : uiText("ui.s_043a718774")}{uiText("ui.collapsed_2bbdb17c35")}</p>
        ) : null}
      </div>

      {post.post_type === "before_after" && post.media.length >= 2 ? (
        <div className="mx-6 mb-2 grid grid-cols-2 gap-1 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant"><span>{uiText("ui.before_9bb7250050")}</span><span>{uiText("ui.after_7b68fe5510")}</span></div>
      ) : null}
      <PostMediaCarousel media={post.media} />

      {post.vehicle && (
        <Link
          href={post.marketplace_listing_id ? `/marketplace/listings/${post.marketplace_listing_id}` : `/vehicle/${post.vehicle.id}`}
          className="mx-6 mb-6 grid overflow-hidden rounded-2xl bg-surface-container transition-colors ghost-border hover:bg-surface-container-high sm:grid-cols-[180px_1fr]"
        >
          <div className="relative h-40 overflow-hidden bg-surface-container-low sm:h-full sm:min-h-40">
            {primaryMedia ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={primaryMedia.url}
                alt={vehicleName}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Car className="h-10 w-10 text-on-surface-variant/30" />
              </div>
            )}
          </div>
          <div className="min-w-0 p-5">
            <div className="mb-2 flex flex-wrap gap-2">
              {post.marketplace_listing ? (
                <Badge className="bg-teal/10 text-teal hover:bg-teal/10">
                  <Tag className="mr-1 h-3 w-3" />{uiText("ui.marketplace_listing_b3090cd8a1")}</Badge>
              ) : (
                <Badge variant="outline">{uiText("ui.vehicle_profile_bb9e352661")}</Badge>
              )}
            </div>
            <p className="font-heading text-lg font-extrabold tracking-tight text-on-surface break-words">
              {vehicleName || uiText("ui.vehicle_profile_003132d6e2")}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-on-surface-variant">
              {post.vehicle.mileage != null && <span>{formatMileage(post.vehicle.mileage)}{uiText("ui.mi_3074dbe604")}</span>}
              {post.marketplace_listing && (
                <span>{formatCurrency(post.marketplace_listing.asking_price_cents)}</span>
              )}
            </div>
          </div>
        </Link>
      )}

      <div className="border-t border-outline-variant/20 bg-surface-container/50 p-6">
        <div className="mb-4 flex items-center gap-3 text-sm font-bold text-on-surface">
          <CommunityLikeButton
            postId={post.id}
            initialLiked={post.liked_by_viewer}
            initialCount={post.like_count}
            disabled={!post.can_like}
          />
          <CommunitySaveButton postId={post.id} initialSaved={post.saved_by_viewer} />
          <SavedCollectionButton entityType="post" entityId={post.id} compact />
          <ShareButton path={sharePath({ kind: "post", id: post.id })} title={uiText("ui.on_perfectppi_community_b43573bef3", { arg0: String(post.author?.display_name ?? post.author?.username ?? uiText("ui.a_member_239ee7bae2")) })} />
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-on-surface-variant" />
            {liveCommentCount}{uiText("ui.comment_774c7dd540")}{liveCommentCount === 1 ? "" : uiText("ui.s_043a718774")}
          </div>
        </div>

        {post.comments.length > 0 && (
          <div className="mb-5 space-y-3">
            {post.comments.map((comment) => {
              const isReply = Boolean(comment.parent_comment_id);
              const authorName = comment.author?.display_name ?? comment.author?.username ?? uiText("ui.perfectppi_user_77df1ce619");
              if (comment.removed) {
                // Plan 15.1: neutral placeholder keeps the replies below it readable.
                return (
                  <div key={comment.id} className="rounded-xl bg-surface-container px-4 py-3 text-xs italic text-on-surface-variant ghost-border">{uiText("ui.comment_removed_f80ae1c83e")}</div>
                );
              }
              const text = (
                <CommunityMentionText content={comment.content} mentions={comment.mentions} className="block whitespace-pre-wrap text-sm text-on-surface-variant" />
              );
              return (
                <div
                  key={comment.id}
                  className={`rounded-xl bg-surface-container-lowest px-4 py-3 ghost-border ${post.accepted_answer_comment_id === comment.id ? "ring-2 ring-teal/30" : ""} ${isReply ? "ml-6 border-l-2 border-outline-variant/40 sm:ml-10" : ""}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-on-surface">{authorName}</p>
                      {post.post_type === "question" && !isReply ? (
                        <AcceptedAnswerControl
                          postId={post.id}
                          commentId={comment.id}
                          accepted={post.accepted_answer_comment_id === comment.id}
                          canManage={post.can_manage_accepted_answer}
                          ownResponse={comment.author_id === post.author_id}
                        />
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] text-on-surface-variant">
                        {formatDate(comment.created_at)}
                        {comment.edited_at ? <span title={uiText("ui.edited_b37cf770a2", { arg0: String(formatDate(comment.edited_at)) })}>{uiText("ui.edited_e9d550c507")}</span> : null}
                      </p>
                      {comment.report_context ? (
                        <CommunityReportControl entityType="community_comment" entityId={comment.id} reportContext={comment.report_context} compact />
                      ) : null}
                    </div>
                  </div>
                  {comment.can_edit ? (
                    <CommunityAuthorEditor entityType="comment" entityId={comment.id} initialContent={comment.content} canRemove={comment.can_remove}>
                      {text}
                    </CommunityAuthorEditor>
                  ) : text}
                  {post.post_type === "question" && !isReply ? (
                    <CommunityHelpfulButton
                      commentId={comment.id}
                      initialHelpful={comment.helpful_by_viewer}
                      initialCount={comment.helpful_count}
                      disabled={!comment.can_mark_helpful}
                    />
                  ) : null}
                  {post.can_interact && !isReply ? (
                    <CommunityReplyForm postId={post.id} parentCommentId={comment.id} replyingTo={authorName} />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {post.can_interact ? (
          <form action={createCommunityComment} className="space-y-3">
            <input type="hidden" name="post_id" value={post.id} />
            <Textarea name="content" placeholder={uiText("ui.add_a_factual_question_or_comment_a4e0f21d49")} rows={3} maxLength={600} />
            <Button type="submit" size="sm">{uiText("ui.comment_44f5e3fbec")}</Button>
          </form>
        ) : post.group ? (
          <Button asChild size="sm" variant="outline"><Link href={`/community/groups/${post.group.slug}`}>{uiText("ui.join_the_group_to_comment_4c6f5effb3")}</Link></Button>
        ) : null}
      </div>
    </article>
  );
}
