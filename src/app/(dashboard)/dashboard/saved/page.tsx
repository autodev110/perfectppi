import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { getSavedCommunityPosts } from "@/features/community/queries";
import { getSavedMarketplaceListings } from "@/features/marketplace/queries";
import { ListingSaveButton } from "@/components/shared/listing-save-button";
import { formatCurrency } from "@/lib/utils/formatting";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CommunitySaveButton } from "@/components/shared/community-save-button";
import { SafetyNotice } from "@/components/shared/safety-notice";
import { formatDate, getInitials } from "@/lib/utils/formatting";
import { Bookmark, Car, MessageSquare, Tag } from "lucide-react";

export const dynamic = "force-dynamic";

// Private saved posts (plan Phase 1B / 7.4 "Saved Items"). Posts that were
// hidden, removed, or moved out of the viewer's audience simply do not
// appear; the save itself is kept so a restored post comes back.
export default async function SavedPostsPage({ searchParams }: { searchParams: Promise<{ page?: string; tab?: string }> }) {
  await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const params = await searchParams;
  const requestedPage = Number(params.page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const tab = params.tab === "listings" ? "listings" : "posts";
  const [posts, listings] = await Promise.all([
    tab === "posts" ? getSavedCommunityPosts(page, 20) : Promise.resolve([]),
    tab === "listings" ? getSavedMarketplaceListings(page, 20) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight">Saved</h1>
          <p className="text-sm text-muted-foreground">
            Posts and listings you bookmarked. Only you can see this list; authors and sellers are never told.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={tab === "listings" ? "/marketplace" : "/community"}>{tab === "listings" ? "Browse Marketplace" : "Back to Community"}</Link>
        </Button>
      </div>

      <nav className="flex w-fit gap-1 rounded-2xl bg-surface-container-low p-1.5 ghost-border" aria-label="Saved items">
        <Link href="/dashboard/saved" className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "posts" ? "bg-surface-container-lowest shadow-sm" : "text-muted-foreground"}`}>Posts</Link>
        <Link href="/dashboard/saved?tab=listings" className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === "listings" ? "bg-surface-container-lowest shadow-sm" : "text-muted-foreground"}`}>Listings</Link>
      </nav>

      {tab === "listings" ? (
        listings.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <Tag className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="font-heading font-bold">No saved listings</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tap Save on a listing to follow it here. You are told when its price changes or it sells.
              </p>
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
                    <Link href={`/vehicle/${listing.vehicle_id}?tab=marketplace`} className="flex min-w-0 items-center gap-3">
                      <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-xl bg-surface-container">
                        <Car className="h-5 w-5 text-muted-foreground" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{listing.title || name || "Listing"}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {name}{name ? " · " : ""}{formatCurrency(listing.asking_price_cents)}
                          {unavailable ? ` · ${listing.status === "sold" ? "Sold" : "No longer available"}` : ""}
                        </span>
                      </span>
                    </Link>
                    <ListingSaveButton listingId={listing.id} initialSaved={listing.saved_by_viewer} variant="inline" />
                  </CardContent>
                </Card>
              );
            })}
            <nav className="flex items-center justify-between pt-2" aria-label="Saved listings pagination">
              {page > 1 ? <Button asChild variant="outline"><Link href={`/dashboard/saved?tab=listings&page=${page - 1}`}>Previous</Link></Button> : <span />}
              {listings.length === 20 ? <Button asChild variant="outline"><Link href={`/dashboard/saved?tab=listings&page=${page + 1}`}>Next</Link></Button> : <span />}
            </nav>
          </div>
        )
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Bookmark className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="font-heading font-bold">Nothing saved yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tap Save on any Community post to keep it here. Posts that become unavailable drop out on their own.
            </p>
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
                        {getInitials(post.author?.display_name ?? post.author?.username ?? "U")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">
                        {post.author?.display_name ?? post.author?.username ?? "PerfectPPI user"}
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
                    {post.comments.length} comment{post.comments.length === 1 ? "" : "s"}
                  </span>
                  <Link href={`/community#post-${post.id}`} className="font-semibold text-primary hover:underline">
                    Open in Community
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
          <nav className="flex items-center justify-between pt-2" aria-label="Saved pagination">
            {page > 1 ? <Button asChild variant="outline"><Link href={`/dashboard/saved?page=${page - 1}`}>Previous</Link></Button> : <span />}
            {posts.length === 20 ? <Button asChild variant="outline"><Link href={`/dashboard/saved?page=${page + 1}`}>Next</Link></Button> : <span />}
          </nav>
        </div>
      )}
    </div>
  );
}
