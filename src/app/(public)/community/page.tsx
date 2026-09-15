import Link from "next/link";
import { Suspense } from "react";
import { getCommunityPostsPage } from "@/features/community/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Search, Users, Warehouse, Bookmark, CalendarDays } from "lucide-react";
import { requireRole } from "@/features/auth/guards";
import { CommunityPostArticle } from "@/components/shared/community-post-article";
import { getFeatureFlags, toClientCapabilities } from "@/lib/feature-flags";
import type { CommunityFeedFilter } from "@/features/social/relationships";
import { decodeCommunityFeedCursor } from "@/features/community/feed-cursor";
import { getCommunityGroups } from "@/features/social/groups";

export const metadata = {
  title: "Community — PerfectPPI",
  description: "Vehicle-focused discussion around listings, inspections, and ownership context.",
};

export const dynamic = "force-dynamic";

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

function feedHref(filter: CommunityFeedFilter, cursor?: string | null) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `/community?${query}` : "/community";
}

async function SuggestedGroupCard() {
  try {
    const groups = await getCommunityGroups();
    const group = groups.find((candidate) =>
      candidate.is_suggested && !candidate.is_member && candidate.visibility === "public",
    );
    if (!group) return null;
    return (
      <aside aria-label="Suggested group" className="rounded-[1.75rem] bg-secondary-container/55 p-6 ghost-border">
        <Badge variant="outline" className="mb-3 bg-background/70">Suggested from your Garage</Badge>
        <h2 className="font-heading text-xl font-extrabold tracking-tight text-on-surface">{group.name}</h2>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-on-surface-variant">{group.description}</p>
        <div className="mt-4 flex items-center justify-between gap-4">
          <span className="text-xs font-semibold text-on-surface-variant">{group.member_count.toLocaleString()} members</span>
          <Button asChild size="sm" variant="outline">
            <Link href={`/community/groups/${group.slug}`}>View group</Link>
          </Button>
        </div>
      </aside>
    );
  } catch (error) {
    console.error("community feed suggestion failed", error);
    return null;
  }
}

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ filter?: string; cursor?: string }> }) {
  const viewer = await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const params = await searchParams;
  const filter = parseFeedFilter(params.filter);
  const cursor = decodeCommunityFeedCursor(params.cursor);
  const [feedPage, capabilities] = await Promise.all([
    getCommunityPostsPage(cursor, 20, filter),
    getFeatureFlags().then(toClientCapabilities),
  ]);
  const posts = feedPage.items;
  const showSuggestion = !params.cursor && filter === "all" && capabilities.capabilities.groups;

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
            <Button asChild variant="outline" className="h-12 rounded-xl px-6">
              <Link href="/community/search">
                <Search className="mr-2 h-4 w-4" />
                Search
              </Link>
            </Button>
            {capabilities.capabilities.groups ? (
              <Button asChild variant="outline" className="h-12 rounded-xl px-6">
                <Link href="/community/groups">
                  <Warehouse className="mr-2 h-4 w-4" />
                  Groups
                </Link>
              </Button>
            ) : null}
            {capabilities.capabilities.events ? (
              <Button asChild variant="outline" className="h-12 rounded-xl px-6">
                <Link href="/community/events">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Events
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
            <Button asChild variant="outline" className="h-12 rounded-xl px-6">
              <Link href="/dashboard/saved">
                <Bookmark className="mr-2 h-4 w-4" />
                Saved
              </Link>
            </Button>
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
            posts.map((post, index) => (
              <div key={post.id} className="contents">
                <CommunityPostArticle post={post} viewerId={viewer.id} />
                {index === 2 && showSuggestion ? <Suspense fallback={null}><SuggestedGroupCard /></Suspense> : null}
              </div>
            ))
          )}
          <nav className="flex items-center justify-between pt-3" aria-label="Community pagination">
            {params.cursor ? <Button asChild variant="outline"><Link href={feedHref(filter)}>Back to latest</Link></Button> : <span />}
            {feedPage.nextCursor ? <Button asChild variant="outline"><Link href={feedHref(filter, feedPage.nextCursor)}>Older posts</Link></Button> : <span />}
          </nav>
        </div>
      </section>
    </div>
  );
}
