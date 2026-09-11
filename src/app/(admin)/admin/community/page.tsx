import Link from "next/link";
import { updateCommunityPostStatus, deleteCommunityPost } from "@/features/community/actions";
import { getAdminCommunityPosts } from "@/features/community/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/formatting";
import { ExternalLink, MessageSquare, Users } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-teal/10 text-teal border-teal/20",
  archived: "bg-surface-container text-on-surface-variant border-outline-variant",
  hidden: "bg-amber-50 text-amber-900 border-amber-200",
};

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

function getVehicleName(vehicle: { year: number | null; make: string | null; model: string | null; trim: string | null } | null) {
  return [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ");
}

export default async function AdminCommunityPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab = params.tab === "archived" ? "archived" : params.tab === "all" ? "all" : params.tab === "review" ? "review" : "active";

  const [{ posts, total }, reviewCount] = await Promise.all([
    getAdminCommunityPosts(1, 100, tab),
    tab === "review" ? Promise.resolve(null) : getAdminCommunityPosts(1, 1, "review").then((result) => result.total),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
        <h1 className="font-heading text-2xl font-bold">Community Moderation</h1>
        <p className="text-muted-foreground">
          Review community posts and moderate content from across the platform.
        </p>
        </div>
        <Button asChild variant="outline"><Link href="/admin/community/groups"><Users className="mr-2 h-4 w-4" />Curated Groups</Link></Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["active", "review", "archived", "all"] as const).map((t) => (
          <Link
            key={t}
            href={`/admin/community${t !== "active" ? `?tab=${t}` : ""}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "all" ? "All" : t === "review" ? `In review${reviewCount ? ` (${reviewCount})` : ""}` : t.charAt(0).toUpperCase() + t.slice(1)}
          </Link>
        ))}
      </div>
      {tab === "review" ? (
        <p className="text-sm text-muted-foreground">
          These posts are hidden while their photos wait for a decision. Approve or reject the photos in{" "}
          <Link href="/admin/moderation?tab=media" className="font-semibold underline">Moderation → Media scans</Link>; the post publishes when every photo is cleared.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Posts ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No community posts.</p>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => {
                const vehicleName = getVehicleName(post.vehicle);
                return (
                  <div key={post.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={STATUS_BADGE[post.status] ?? ""}>
                            {post.status}
                          </Badge>
                          <Badge variant="secondary">
                            {post.author?.display_name ?? post.author?.username ?? "PerfectPPI user"}
                          </Badge>
                          {vehicleName && <Badge variant="secondary">{vehicleName}</Badge>}
                        </div>
                        <p className="max-w-4xl whitespace-pre-wrap text-sm text-muted-foreground">{post.content}</p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>Created {formatDate(post.created_at)}</span>
                          {post.status === "archived" && (
                            <span>Archived {formatDate(post.updated_at)}</span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <MessageSquare className="h-3.5 w-3.5" />
                            {post.comments.length} comments
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link href="/community">
                            <ExternalLink className="mr-2 h-3.5 w-3.5" />
                            Feed
                          </Link>
                        </Button>
                        {post.status !== "active" && (
                          <form action={updateCommunityPostStatus}>
                            <input type="hidden" name="post_id" value={post.id} />
                            <input type="hidden" name="status" value="active" />
                            <Button size="sm" variant="secondary" type="submit">Restore</Button>
                          </form>
                        )}
                        {post.status !== "archived" && (
                          <form action={updateCommunityPostStatus}>
                            <input type="hidden" name="post_id" value={post.id} />
                            <input type="hidden" name="status" value="archived" />
                            <Button size="sm" variant="ghost" type="submit">Archive</Button>
                          </form>
                        )}
                        <form action={deleteCommunityPost}>
                          <input type="hidden" name="post_id" value={post.id} />
                          <Button size="sm" variant="ghost" type="submit" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            Remove from Community
                          </Button>
                        </form>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
