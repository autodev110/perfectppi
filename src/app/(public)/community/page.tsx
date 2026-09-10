import Link from "next/link";
import { createCommunityComment } from "@/features/community/actions";
import { getCommunityPosts } from "@/features/community/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate, formatMileage, getInitials } from "@/lib/utils/formatting";
import { Car, MessageSquare, Plus, Tag, Users, Warehouse } from "lucide-react";
import { PostMediaCarousel } from "@/components/shared/post-media-carousel";
import { requireRole } from "@/features/auth/guards";
import { MemberSafetyActions } from "@/components/shared/member-safety-actions";
import { SafetyNotice } from "@/components/shared/safety-notice";
import { CommunityReportControl } from "@/components/shared/community-report-control";
import { AcceptedAnswerControl } from "@/components/shared/accepted-answer-control";
import { CommunityLikeButton } from "@/components/shared/community-like-button";
import { getFeatureFlags, toClientCapabilities } from "@/lib/feature-flags";
import type { CommunityFeedFilter } from "@/features/social/relationships";

export const metadata = {
  title: "Community — PerfectPPI",
  description: "Vehicle-focused discussion around listings, inspections, and ownership context.",
};

export const dynamic = "force-dynamic";

function getVehicleName(vehicle: { year: number | null; make: string | null; model: string | null; trim: string | null } | null) {
  return [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ");
}

const feedFilters: Array<{ value: CommunityFeedFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "friends", label: "Friends" },
  { value: "my_cars", label: "My Cars" },
];

function parseFeedFilter(value?: string): CommunityFeedFilter {
  return feedFilters.some((filter) => filter.value === value)
    ? (value as CommunityFeedFilter)
    : "all";
}

function feedHref(filter: CommunityFeedFilter, page = 1) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/community?${query}` : "/community";
}

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ filter?: string; page?: string }> }) {
  const viewer = await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const params = await searchParams;
  const filter = parseFeedFilter(params.filter);
  const requestedPage = Number(params.page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [posts, capabilities] = await Promise.all([
    getCommunityPosts(page, 20, filter),
    getFeatureFlags().then(toClientCapabilities),
  ]);

  const emptyCopy = filter === "friends"
    ? {
        title: "No posts from friends yet",
        message: "Posts shared by people you are friends with will appear here.",
      }
    : filter === "my_cars"
      ? {
          title: "No posts for your Garage yet",
          message: "Posts about the makes and models in your Garage will appear here.",
        }
      : {
          title: "No community posts yet",
          message: "Posts will appear here once users share public vehicles, active listings, or inspection conversations.",
        };

  return (
    <div className="min-h-screen bg-surface">
      <section className="relative overflow-hidden px-8 pb-12 pt-28">
        <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-surface-container-low to-transparent" />
        <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <Badge className="mb-5 bg-secondary-container text-on-secondary-container hover:bg-secondary-container">
              Parent Platform Module
            </Badge>
            <h1 className="font-heading text-4xl font-extrabold tracking-tighter text-on-surface md:text-6xl md:leading-[1.02]">
              Community posts tied to real vehicles.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-on-surface-variant md:text-lg">
              A lightweight feed for listing shares, inspection discussions, and vehicle context. No fake engagement, no generic social clutter.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {capabilities.capabilities.groups ? (
              <Button asChild variant="outline" className="h-12 rounded-xl px-6">
                <Link href="/community/groups">
                  <Warehouse className="mr-2 h-4 w-4" />
                  Groups
                </Link>
              </Button>
            ) : null}
            {capabilities.capabilities.friendsDiscovery ? (
              <Button asChild variant="outline" className="h-12 rounded-xl px-6">
                <Link href="/community/people">
                  <Users className="mr-2 h-4 w-4" />
                  Find People
                </Link>
              </Button>
            ) : null}
            <Button asChild className="h-12 rounded-xl px-6">
              <Link href="/dashboard/posts/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Post
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="px-8 pb-20">
        <div className="mx-auto max-w-3xl space-y-5">
          <nav
            aria-label="Community feed"
            className="flex w-full gap-1 rounded-2xl bg-surface-container-low p-1.5 ghost-border sm:w-fit"
          >
            {feedFilters.map((option) => {
              const active = filter === option.value;
              return (
                <Link
                  key={option.value}
                  href={feedHref(option.value)}
                  aria-current={active ? "page" : undefined}
                  className={`flex-1 rounded-xl px-5 py-2.5 text-center text-sm font-bold transition-colors sm:flex-none ${
                    active
                      ? "bg-surface-container-lowest text-on-surface shadow-sm"
                      : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  }`}
                >
                  {option.label}
                </Link>
              );
            })}
          </nav>
          {posts.length === 0 ? (
            <div className="rounded-[1.75rem] bg-surface-container-lowest p-12 text-center shadow-sm ghost-border">
              <Users className="mx-auto mb-4 h-12 w-12 text-on-surface-variant/30" />
              <h2 className="mb-2 font-heading text-xl font-extrabold tracking-tight text-on-surface">
                {emptyCopy.title}
              </h2>
              <p className="mx-auto mb-6 max-w-md text-sm text-on-surface-variant">
                {emptyCopy.message}
              </p>
              <Button asChild>
                <Link href="/dashboard/posts/new">Create the first post</Link>
              </Button>
            </div>
          ) : (
            posts.map((post) => {
              const vehicleName = getVehicleName(post.vehicle);
              const primaryMedia = post.vehicle?.vehicle_media?.find((media) => media.is_primary) ?? post.vehicle?.vehicle_media?.[0];

              return (
                <article key={post.id} className="overflow-hidden rounded-[1.5rem] bg-surface-container-lowest shadow-sm ghost-border">
                  <div className="p-6">
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={post.author?.avatar_url ?? ""} />
                          <AvatarFallback className="text-xs">
                            {getInitials(post.author?.display_name ?? post.author?.username ?? "U")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-bold text-on-surface">
                            {post.author?.display_name ?? post.author?.username ?? "PerfectPPI user"}
                          </p>
                          <p className="text-xs text-on-surface-variant">{formatDate(post.created_at)}</p>
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
                            {post.accepted_answer_comment_id ? "Solved" : "Question"}
                          </Badge>
                        ) : null}
                        <Badge variant="outline" className="rounded-full capitalize">{post.audience}</Badge>
                        {post.author_id !== viewer.id ? <MemberSafetyActions profileId={post.author_id} compact /> : null}
                        {post.report_context ? (
                          <CommunityReportControl entityType="community_post" entityId={post.id} reportContext={post.report_context} />
                        ) : null}
                      </div>
                    </div>

                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">
                      {post.content}
                    </p>
                    {post.safety_notice ? (
                      <div className="mt-4">
                        <SafetyNotice notice={post.safety_notice} />
                      </div>
                    ) : null}
                  </div>

                  <PostMediaCarousel media={post.media} />

                  {post.vehicle && (
                    <Link
                      href={`/vehicle/${post.vehicle.id}${post.marketplace_listing_id ? "?tab=marketplace" : ""}`}
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
                              <Tag className="mr-1 h-3 w-3" />
                              Marketplace Listing
                            </Badge>
                          ) : (
                            <Badge variant="outline">Vehicle Profile</Badge>
                          )}
                        </div>
                        <p className="font-heading text-lg font-extrabold tracking-tight text-on-surface break-words">
                          {vehicleName || "Vehicle profile"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-on-surface-variant">
                          {post.vehicle.mileage != null && <span>{formatMileage(post.vehicle.mileage)} mi</span>}
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
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-on-surface-variant" />
                        {post.comments.length} comment{post.comments.length === 1 ? "" : "s"}
                      </div>
                    </div>

                    {post.comments.length > 0 && (
                      <div className="mb-5 space-y-3">
                        {post.comments.map((comment) => (
                          <div key={comment.id} className={`rounded-xl bg-surface-container-lowest px-4 py-3 ghost-border ${post.accepted_answer_comment_id === comment.id ? "ring-2 ring-teal/30" : ""}`}>
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs font-bold text-on-surface">
                                  {comment.author?.display_name ?? comment.author?.username ?? "PerfectPPI user"}
                                </p>
                                {post.post_type === "question" ? (
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
                                <p className="text-[10px] text-on-surface-variant">{formatDate(comment.created_at)}</p>
                                {comment.report_context ? (
                                  <CommunityReportControl entityType="community_comment" entityId={comment.id} reportContext={comment.report_context} compact />
                                ) : null}
                              </div>
                            </div>
                            <p className="whitespace-pre-wrap text-sm text-on-surface-variant">{comment.content}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {post.can_interact ? (
                      <form action={createCommunityComment} className="space-y-3">
                        <input type="hidden" name="post_id" value={post.id} />
                        <Textarea name="content" placeholder="Add a factual question or comment..." rows={3} maxLength={600} />
                        <Button type="submit" size="sm">Comment</Button>
                      </form>
                    ) : post.group ? (
                      <Button asChild size="sm" variant="outline"><Link href={`/community/groups/${post.group.slug}`}>Join the group to comment</Link></Button>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
          <nav className="flex items-center justify-between pt-3" aria-label="Community pagination">
            {page > 1 ? <Button asChild variant="outline"><Link href={feedHref(filter, page - 1)}>Previous</Link></Button> : <span />}
            {posts.length === 20 ? <Button asChild variant="outline"><Link href={feedHref(filter, page + 1)}>Next</Link></Button> : <span />}
          </nav>
        </div>
      </section>
    </div>
  );
}
