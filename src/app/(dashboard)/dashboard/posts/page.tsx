import Link from "next/link";
import {
  archiveMyCommunityPost,
  restoreMyCommunityPost,
  deleteCommunityPost,
} from "@/features/community/actions";
import { getMyCommunityPosts, archiveDaysRemaining } from "@/features/community/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/formatting";
import { AlertTriangle, Archive, ExternalLink, MessageSquare, Plus, RotateCcw, Trash2, Users } from "lucide-react";
import { PostMediaManager } from "@/components/shared/post-media-manager";
import { appealModerationItem } from "@/features/moderation/actions";
import { Textarea } from "@/components/ui/textarea";
import { requireRole } from "@/features/auth/guards";
import { getEnforcementNotices } from "@/features/moderation/queries";
import { CommunityMentionText } from "@/components/shared/community-mention-text";

import { getRequestTranslator } from "@/lib/i18n/server";

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

function getVehicleName(vehicle: { year: number | null; make: string | null; model: string | null; trim: string | null } | null) {
  return [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ");
}

export default async function DashboardPostsPage({ searchParams }: PageProps) {
  const uiText = await getRequestTranslator();
  const params = await searchParams;
  const tab = params.tab === "archived" ? "archived" : params.tab === "review" ? "review" : "active";

  const profile = await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const [posts, notices] = await Promise.all([
    getMyCommunityPosts(tab),
    getEnforcementNotices(profile.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{uiText("ui.my_community_posts_41ef09885e")}</h1>
          <p className="text-muted-foreground">{uiText("ui.manage_posts_you_have_published_to_the_publi_42b4864b90")}</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/posts/new">
            <Plus className="mr-2 h-4 w-4" />{uiText("ui.new_post_22072462f9")}</Link>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <Link
          href="/dashboard/posts"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "active"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >{uiText("ui.active_9234069589")}</Link>
        <Link
          href="/dashboard/posts?tab=review"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "review"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >{uiText("ui.in_review_2677214a92")}</Link>
        <Link
          href="/dashboard/posts?tab=archived"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "archived"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >{uiText("ui.archived_bdb86505f8")}</Link>
      </div>

      {notices.map((notice) => (
        <div key={notice.id} className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
          <strong>{notice.action_type.replaceAll("_", " ")}:</strong>{" "}
          {notice.reason_code.replaceAll("_", " ")}
          {notice.ends_at ? uiText("ui.until_020343c34c", { arg0: String(formatDate(notice.ends_at)) }) : ""}
        </div>
      ))}

      {tab === "archived" && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{uiText("ui.archived_posts_are_automatically_deleted_aft_2ce4c2a42c")}</span>
        </div>
      )}

      {posts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            {tab === "archived" ? (
              <>
                <Archive className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">{uiText("ui.no_archived_posts_ae7b4580b3")}</p>
                <p className="mb-4 max-w-md text-sm text-muted-foreground">{uiText("ui.archived_posts_remain_restorable_for_30_days_82573b7f9b")}</p>
              </>
            ) : tab === "review" ? (
              <>
                <AlertTriangle className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">{uiText("ui.nothing_awaiting_moderation_ae8dbe8e9b")}</p>
                <p className="max-w-md text-sm text-muted-foreground">{uiText("ui.posts_held_for_review_or_rejected_under_the__c0d92c5b17")}</p>
              </>
            ) : (
              <>
                <Users className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">{uiText("ui.no_community_posts_yet_ce8b5574d2")}</p>
                <p className="mb-4 max-w-md text-sm text-muted-foreground">{uiText("ui.share_a_public_vehicle_active_listing_or_ins_eaa1cd27ec")}</p>
                <Button asChild>
                  <Link href="/dashboard/posts/new">{uiText("ui.create_post_80c6491121")}</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => {
            const vehicleName = getVehicleName(post.vehicle);
            const daysLeft = tab === "archived" ? archiveDaysRemaining(post.updated_at) : null;

            return (
              <Card key={post.id}>
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {vehicleName && <Badge variant="secondary">{vehicleName}</Badge>}
                        {post.marketplace_listing && <Badge variant="secondary">{uiText("ui.listing_shared_d646bb8f23")}</Badge>}
                        {post.post_type === "question" ? (
                          <Badge variant="outline">
                            {post.accepted_answer_comment_id ? uiText("ui.solved_question_e2df3e8dfc") : uiText("ui.question_troubleshooting_9b41a96854")}
                          </Badge>
                        ) : null}
                        {tab === "review" && (
                          <Badge variant={post.moderation_status === "rejected" ? "destructive" : "outline"}>
                            {post.moderation_status === "active" && post.status === "hidden"
                              ? uiText("ui.media_under_review_71726d60ec")
                              : post.moderation_status.replaceAll("_", " ")}
                          </Badge>
                        )}
                        {daysLeft !== null && (
                          <Badge
                            variant="outline"
                            className={
                              daysLeft <= 7
                                ? "border-destructive/40 bg-destructive/5 text-destructive"
                                : "border-warning/30 bg-warning/5 text-warning"
                            }
                          >
                            {daysLeft === 0 ? uiText("ui.expires_today_55f573dbaf") : uiText("ui.expires_in_d_d14a4e3a24", { arg0: String(daysLeft) })}
                          </Badge>
                        )}
                      </div>
                      <CommunityMentionText content={post.content} mentions={post.mentions} className="block max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground" />
                      <PostMediaManager
                        postId={post.id}
                        media={post.media}
                        locked={post.moderation_status === "legal_hold"}
                      />
                      {tab === "review" && post.moderation_status === "rejected" ? (
                        <form action={appealModerationItem} className="max-w-xl space-y-2 rounded-xl border p-3">
                          <input type="hidden" name="entity_id" value={post.id} />
                          <p className="text-xs font-semibold">{uiText("ui.think_this_was_a_mistake_34301bdcbb")}</p>
                          <Textarea name="statement" minLength={10} maxLength={1000} rows={2} required placeholder={uiText("ui.explain_why_this_post_should_be_reviewed_aga_05ef0ae397")} />
                          <Button type="submit" size="sm" variant="outline">{uiText("ui.submit_appeal_86efa24304")}</Button>
                        </form>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>{uiText("ui.created_f21b805903")}{formatDate(post.created_at)}</span>
                        {post.edited_at ? <span>{uiText("ui.edited_150885512e")}{formatDate(post.edited_at)}</span> : null}
                        {tab === "archived" && (
                          <span>{uiText("ui.archived_d93f69fed6")}{formatDate(post.updated_at)}</span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {post.comments.length}{uiText("ui.comments_28037aeb4e")}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tab === "active" && (
                        <Button size="sm" variant="outline" asChild>
                          <Link href="/community">
                            <ExternalLink className="mr-2 h-3.5 w-3.5" />{uiText("ui.feed_396c3cb18f")}</Link>
                        </Button>
                      )}
                      {tab === "active" && (
                        <form action={archiveMyCommunityPost}>
                          <input type="hidden" name="post_id" value={post.id} />
                          <Button size="sm" variant="ghost" type="submit">
                            <Archive className="mr-1.5 h-3.5 w-3.5" />{uiText("ui.archive_66f4804ee2")}</Button>
                        </form>
                      )}
                      {tab === "archived" && (
                        <form action={restoreMyCommunityPost}>
                          <input type="hidden" name="post_id" value={post.id} />
                          <Button size="sm" variant="secondary" type="submit">
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />{uiText("ui.restore_a76e13b983")}</Button>
                        </form>
                      )}
                      {post.moderation_status === "legal_hold" ? null : <form action={deleteCommunityPost}>
                        <input type="hidden" name="post_id" value={post.id} />
                        <Button size="sm" variant="ghost" type="submit" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />{uiText("ui.remove_c3812fc4ac")}</Button>
                      </form>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
