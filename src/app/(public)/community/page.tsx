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
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const metadata = {
  title: uiText("ui.community_perfectppi_1c0423d3ff"),
  description: uiText("ui.vehicle_focused_discussion_around_listings_i_66c42aac5e"),
};

export const dynamic = "force-dynamic";

const feedFilters: Array<{ value: CommunityFeedFilter; label: string }> = [
  { value: "all", label: uiText("ui.all_a52ace420f") },
  { value: "friends", label: uiText("ui.friends_bd104d1b98") },
  { value: "my_cars", label: uiText("ui.my_cars_af17cd609b") },
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
  const uiText = await getRequestTranslator();
  try {
    const groups = await getCommunityGroups();
    const group = groups.find((candidate) =>
      candidate.is_suggested && !candidate.is_member && candidate.visibility === "public",
    );
    if (!group) return null;
    return (
      <aside aria-label={uiText("ui.suggested_group_fdbde3b211")} className="rounded-[1.75rem] bg-secondary-container/55 p-6 ghost-border">
        <Badge variant="outline" className="mb-3 bg-background/70">{uiText("ui.suggested_from_your_garage_13e7724408")}</Badge>
        <h2 className="font-heading text-xl font-extrabold tracking-tight text-on-surface">{group.name}</h2>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-on-surface-variant">{group.description}</p>
        <div className="mt-4 flex items-center justify-between gap-4">
          <span className="text-xs font-semibold text-on-surface-variant">{group.member_count.toLocaleString()}{uiText("ui.members_c93aa5da28")}</span>
          <Button asChild size="sm" variant="outline">
            <Link href={`/community/groups/${group.slug}`}>{uiText("ui.view_group_0252963f59")}</Link>
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
  const uiText = await getRequestTranslator();
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
        title: uiText("ui.no_posts_from_friends_yet_d8ed370670"),
        message: uiText("ui.posts_shared_by_people_you_are_friends_with__ded14b26ff"),
      }
    : filter === "my_cars"
      ? {
          title: uiText("ui.no_posts_for_your_garage_yet_746415825b"),
          message: uiText("ui.posts_about_the_makes_and_models_in_your_gar_7822fc55f2"),
        }
      : {
          title: uiText("ui.no_community_posts_yet_ce8b5574d2"),
          message: uiText("ui.posts_will_appear_here_once_users_share_publ_ff30e13474"),
        };

  return (
    <div className="min-h-screen bg-surface">
      <section className="relative overflow-hidden px-8 pb-12 pt-28">
        <div className="absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-surface-container-low to-transparent" />
        <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <Badge className="mb-5 bg-secondary-container text-on-secondary-container hover:bg-secondary-container">{uiText("ui.parent_platform_module_576643f293")}</Badge>
            <h1 className="font-heading text-4xl font-extrabold tracking-tighter text-on-surface md:text-6xl md:leading-[1.02]">{uiText("ui.community_posts_tied_to_real_vehicles_8ab01118cf")}</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-on-surface-variant md:text-lg">{uiText("ui.a_lightweight_feed_for_listing_shares_inspec_6deeda1687")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-12 rounded-xl px-6">
              <Link href="/community/search">
                <Search className="mr-2 h-4 w-4" />{uiText("ui.search_49c266baaa")}</Link>
            </Button>
            {capabilities.capabilities.groups ? (
              <Button asChild variant="outline" className="h-12 rounded-xl px-6">
                <Link href="/community/groups">
                  <Warehouse className="mr-2 h-4 w-4" />{uiText("ui.groups_39bbb719fa")}</Link>
              </Button>
            ) : null}
            {capabilities.capabilities.events ? (
              <Button asChild variant="outline" className="h-12 rounded-xl px-6">
                <Link href="/community/events">
                  <CalendarDays className="mr-2 h-4 w-4" />{uiText("ui.events_8d14f6e72d")}</Link>
              </Button>
            ) : null}
            {capabilities.capabilities.friendsDiscovery ? (
              <Button asChild variant="outline" className="h-12 rounded-xl px-6">
                <Link href="/community/people">
                  <Users className="mr-2 h-4 w-4" />{uiText("ui.find_people_0b7aa8327b")}</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" className="h-12 rounded-xl px-6">
              <Link href="/dashboard/saved">
                <Bookmark className="mr-2 h-4 w-4" />{uiText("ui.saved_b5c120b316")}</Link>
            </Button>
            <Button asChild className="h-12 rounded-xl px-6">
              <Link href="/dashboard/posts/new">
                <Plus className="mr-2 h-4 w-4" />{uiText("ui.create_post_80c6491121")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="px-8 pb-20">
        <div className="mx-auto max-w-3xl space-y-5">
          <nav
            aria-label={uiText("ui.community_feed_0459794e75")}
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
                <Link href="/dashboard/posts/new">{uiText("ui.create_the_first_post_e9beaf3bf1")}</Link>
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
          <nav className="flex items-center justify-between pt-3" aria-label={uiText("ui.community_pagination_efb16dd957")}>
            {params.cursor ? <Button asChild variant="outline"><Link href={feedHref(filter)}>{uiText("ui.back_to_latest_86cf0aefc0")}</Link></Button> : <span />}
            {feedPage.nextCursor ? <Button asChild variant="outline"><Link href={feedHref(filter, feedPage.nextCursor)}>{uiText("ui.older_posts_31520ce905")}</Link></Button> : <span />}
          </nav>
        </div>
      </section>
    </div>
  );
}
