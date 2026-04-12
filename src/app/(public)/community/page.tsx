import Link from "next/link";
import { createCommunityComment } from "@/features/community/actions";
import { getCommunityPosts } from "@/features/community/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate, formatMileage, getInitials } from "@/lib/utils/formatting";
import { Car, MessageSquare, Plus, Tag, Users } from "lucide-react";

export const metadata = {
  title: "Community — PerfectPPI",
  description: "Vehicle-focused discussion around listings, inspections, and ownership context.",
};

export const dynamic = "force-dynamic";

function getVehicleName(vehicle: { year: number | null; make: string | null; model: string | null; trim: string | null } | null) {
  return [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ");
}

export default async function CommunityPage() {
  const posts = await getCommunityPosts();

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
          <Button asChild className="h-12 rounded-xl px-6">
            <Link href="/dashboard/posts/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Post
            </Link>
          </Button>
        </div>
      </section>

      <section className="px-8 pb-20">
        <div className="mx-auto max-w-3xl space-y-5">
          {posts.length === 0 ? (
            <div className="rounded-[1.75rem] bg-surface-container-lowest p-12 text-center shadow-sm ghost-border">
              <Users className="mx-auto mb-4 h-12 w-12 text-on-surface-variant/30" />
              <h2 className="mb-2 font-heading text-xl font-extrabold tracking-tight text-on-surface">
                No community posts yet
              </h2>
              <p className="mx-auto mb-6 max-w-md text-sm text-on-surface-variant">
                Posts will appear here once users share public vehicles, active listings, or inspection conversations.
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
                        </div>
                      </div>
                      <Badge variant="outline" className="rounded-full">
                        Discussion
                      </Badge>
                    </div>

                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-on-surface-variant">
                      {post.content}
                    </p>
                  </div>

                  {post.vehicle && (
                    <Link
                      href={`/vehicle/${post.vehicle.id}${post.marketplace_listing_id ? "?tab=marketplace" : ""}`}
                      className="mx-6 mb-6 grid overflow-hidden rounded-2xl bg-surface-container transition-colors ghost-border hover:bg-surface-container-high sm:grid-cols-[180px_1fr]"
                    >
                      <div className="h-40 bg-surface-container-low sm:h-full">
                        {primaryMedia ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={primaryMedia.url} alt={vehicleName} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Car className="h-10 w-10 text-on-surface-variant/30" />
                          </div>
                        )}
                      </div>
                      <div className="p-5">
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
                        <p className="font-heading text-lg font-extrabold tracking-tight text-on-surface">
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
                    <div className="mb-4 flex items-center gap-2 text-sm font-bold text-on-surface">
                      <MessageSquare className="h-4 w-4 text-on-surface-variant" />
                      {post.comments.length} comment{post.comments.length === 1 ? "" : "s"}
                    </div>

                    {post.comments.length > 0 && (
                      <div className="mb-5 space-y-3">
                        {post.comments.map((comment) => (
                          <div key={comment.id} className="rounded-xl bg-surface-container-lowest px-4 py-3 ghost-border">
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <p className="text-xs font-bold text-on-surface">
                                {comment.author?.display_name ?? comment.author?.username ?? "PerfectPPI user"}
                              </p>
                              <p className="text-[10px] text-on-surface-variant">{formatDate(comment.created_at)}</p>
                            </div>
                            <p className="whitespace-pre-wrap text-sm text-on-surface-variant">{comment.content}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <form action={createCommunityComment} className="space-y-3">
                      <input type="hidden" name="post_id" value={post.id} />
                      <Textarea name="content" placeholder="Add a factual question or comment..." rows={3} maxLength={600} />
                      <Button type="submit" size="sm">Comment</Button>
                    </form>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
