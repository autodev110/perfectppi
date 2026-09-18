import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { getSavedCommunityPostsPage } from "@/features/community/queries";
import { getSavedMarketplaceListingsPage } from "@/features/marketplace/queries";
import { ListingSaveButton } from "@/components/shared/listing-save-button";
import { formatCurrency } from "@/lib/utils/formatting";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CommunitySaveButton } from "@/components/shared/community-save-button";
import { SafetyNotice } from "@/components/shared/safety-notice";
import { SavedCollectionsManager } from "@/components/shared/saved-collections-manager";
import { listSavedCollections } from "@/features/saved/collections";
import { formatDate, getInitials } from "@/lib/utils/formatting";
import { Bookmark, Car, MessageSquare, Tag } from "lucide-react";
import { decodeSavedCursor } from "@/features/saved/cursor";

import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

// Private saved posts (plan Phase 1B / 7.4 "Saved Items"). Posts that were
// hidden, removed, or moved out of the viewer's audience simply do not
// appear; the save itself is kept so a restored post comes back.
export default async function SavedPostsPage({ searchParams }: { searchParams: Promise<{ tab?: string; cursor?: string }> }) {
  const uiText = await getRequestTranslator();
  const profile = await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const params = await searchParams;
  const tab = params.tab === "listings" || params.tab === "collections" ? params.tab : "posts";
  const cursor = params.cursor && tab !== "collections" ? decodeSavedCursor(params.cursor, tab) : null;
  const [postPage, listingPage, collections] = await Promise.all([
    tab === "posts" ? getSavedCommunityPostsPage(cursor, 20) : Promise.resolve({ items: [], nextCursor: null }),
    tab === "listings" ? getSavedMarketplaceListingsPage(cursor, 20) : Promise.resolve({ items: [], nextCursor: null }),
    tab === "collections" ? listSavedCollections(profile.id) : Promise.resolve([]),
  ]);
  const posts = postPage.items;
  const listings = listingPage.items;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight">{uiText("ui.saved_b5c120b316")}</h1>
          <p className="text-sm text-muted-foreground">{uiText("ui.bookmarks_and_named_collections_only_you_can_1770ec62f6")}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={tab === "listings" ? "/marketplace" : "/community"}>{tab === "listings" ? uiText("ui.browse_marketplace_d319099fe0") : uiText("ui.back_to_community_fc6e768cae")}</Link>
        </Button>
      </div>

      <nav className="flex w-fit gap-1 rounded-2xl bg-surface-container-low p-1.5 ghost-border" aria-label={uiText("ui.saved_items_76f4856bed")}>
        <Link href="/dashboard/saved" className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "posts" ? "bg-surface-container-lowest shadow-sm" : "text-muted-foreground"}`}>{uiText("ui.posts_a80811cf68")}</Link>
        <Link href="/dashboard/saved?tab=listings" className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "listings" ? "bg-surface-container-lowest shadow-sm" : "text-muted-foreground"}`}>{uiText("ui.listings_5009238dba")}</Link>
        <Link href="/dashboard/saved?tab=collections" className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "collections" ? "bg-surface-container-lowest shadow-sm" : "text-muted-foreground"}`}>{uiText("ui.collections_9f9feade76")}</Link>
      </nav>

      {tab === "collections" ? (
        <SavedCollectionsManager initialCollections={collections} />
      ) : tab === "listings" ? (
        listings.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <Tag className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="font-heading font-bold">{uiText("ui.no_saved_listings_ff1345a7ca")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{uiText("ui.tap_save_on_a_listing_to_follow_it_here_you__9be70cb28e")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {listings.map((listing) => {
              const name = [listing.vehicle?.year, listing.vehicle?.make, listing.vehicle?.model].filter(Boolean).join(" ");
              const unavailable = listing.status !== "active";
              return (
                <Card key={listing.id}>
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <Link href={`/marketplace/listings/${listing.id}`} className="flex min-w-0 items-center gap-3">
                      <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-xl bg-surface-container">
                        <Car className="h-5 w-5 text-muted-foreground" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{listing.title || name || uiText("ui.listing_fc7f1aa205")}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {name}{name ? " · " : ""}{formatCurrency(listing.asking_price_cents)}
                          {unavailable ? uiText("ui.text_913ac5c53d", { arg0: String(listing.status === "sold" ? uiText("ui.sold_b870b1b487") : uiText("ui.no_longer_available_4bc7f76d36")) }) : ""}
                        </span>
                      </span>
                    </Link>
                    <ListingSaveButton listingId={listing.id} initialSaved={listing.saved_by_viewer} variant="inline" />
                  </CardContent>
                </Card>
              );
            })}
            <nav className="flex items-center justify-between pt-2" aria-label={uiText("ui.saved_listings_pagination_7adfa86fb9")}>
              {params.cursor ? <Button asChild variant="outline"><Link href="/dashboard/saved?tab=listings">{uiText("ui.back_to_first_results_58fbbfa217")}</Link></Button> : <span />}
              {listingPage.nextCursor ? <Button asChild variant="outline"><Link href={`/dashboard/saved?tab=listings&cursor=${encodeURIComponent(listingPage.nextCursor)}`}>{uiText("ui.more_listings_ea1dc5ff04")}</Link></Button> : <span />}
            </nav>
          </div>
        )
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Bookmark className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="font-heading font-bold">{uiText("ui.nothing_saved_yet_96e97dcf07")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{uiText("ui.tap_save_on_any_community_post_to_keep_it_he_8022729dec")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={post.author?.username ? `/profile/${post.author.username}` : "/community"}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={post.author?.avatar_url ?? ""} />
                      <AvatarFallback className="text-xs">
                        {getInitials(post.author?.display_name ?? post.author?.username ?? uiText("ui.u_a25513c7e0"))}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">
                        {post.author?.display_name ?? post.author?.username ?? uiText("ui.perfectppi_user_77df1ce619")}
                      </span>
                      <span className="block text-xs text-muted-foreground">{formatDate(post.created_at)}</span>
                    </span>
                  </Link>
                  <CommunitySaveButton postId={post.id} initialSaved={post.saved_by_viewer} compact />
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.content}</p>
                {post.safety_notice ? <SafetyNotice notice={post.safety_notice} compact /> : null}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {post.comments.length}{uiText("ui.comment_774c7dd540")}{post.comments.length === 1 ? "" : uiText("ui.s_043a718774")}
                  </span>
                  <Link href={`/community#post-${post.id}`} className="font-semibold text-primary hover:underline">{uiText("ui.open_in_community_5b1fe0f025")}</Link>
                </div>
              </CardContent>
            </Card>
          ))}
          <nav className="flex items-center justify-between pt-2" aria-label={uiText("ui.saved_pagination_adeb673e08")}>
            {params.cursor ? <Button asChild variant="outline"><Link href="/dashboard/saved">{uiText("ui.back_to_first_results_58fbbfa217")}</Link></Button> : <span />}
            {postPage.nextCursor ? <Button asChild variant="outline"><Link href={`/dashboard/saved?cursor=${encodeURIComponent(postPage.nextCursor)}`}>{uiText("ui.more_posts_6a4ac3287f")}</Link></Button> : <span />}
          </nav>
        </div>
      )}
    </div>
  );
}
