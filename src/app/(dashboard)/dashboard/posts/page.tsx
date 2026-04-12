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

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

function getVehicleName(vehicle: { year: number | null; make: string | null; model: string | null; trim: string | null } | null) {
  return [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ");
}

export default async function DashboardPostsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab = params.tab === "archived" ? "archived" : "active";

  const posts = await getMyCommunityPosts(tab);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">My Community Posts</h1>
          <p className="text-muted-foreground">
            Manage posts you have published to the public community feed.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/posts/new">
            <Plus className="mr-2 h-4 w-4" />
            New Post
          </Link>
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
        >
          Active
        </Link>
        <Link
          href="/dashboard/posts?tab=archived"
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "archived"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Archived
        </Link>
      </div>

      {tab === "archived" && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Archived posts are automatically deleted after 30 days. Restore a post to keep it.
          </span>
        </div>
      )}

      {posts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            {tab === "archived" ? (
              <>
                <Archive className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">No archived posts</p>
                <p className="mb-4 max-w-md text-sm text-muted-foreground">
                  Posts you archive will appear here for 30 days before being permanently removed.
                </p>
              </>
            ) : (
              <>
                <Users className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">No community posts yet</p>
                <p className="mb-4 max-w-md text-sm text-muted-foreground">
                  Share a public vehicle, active listing, or inspection discussion when it is ready for buyers to see.
                </p>
                <Button asChild>
                  <Link href="/dashboard/posts/new">Create Post</Link>
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
                        {post.marketplace_listing && <Badge variant="secondary">Listing shared</Badge>}
                        {daysLeft !== null && (
                          <Badge
                            variant="outline"
                            className={
                              daysLeft <= 7
                                ? "border-destructive/40 bg-destructive/5 text-destructive"
                                : "border-warning/30 bg-warning/5 text-warning"
                            }
                          >
                            {daysLeft === 0 ? "Expires today" : `Expires in ${daysLeft}d`}
                          </Badge>
                        )}
                      </div>
                      <p className="max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">{post.content}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>Created {formatDate(post.created_at)}</span>
                        {tab === "archived" && (
                          <span>Archived {formatDate(post.updated_at)}</span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {post.comments.length} comments
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tab === "active" && (
                        <Button size="sm" variant="outline" asChild>
                          <Link href="/community">
                            <ExternalLink className="mr-2 h-3.5 w-3.5" />
                            Feed
                          </Link>
                        </Button>
                      )}
                      {tab === "active" && (
                        <form action={archiveMyCommunityPost}>
                          <input type="hidden" name="post_id" value={post.id} />
                          <Button size="sm" variant="ghost" type="submit">
                            <Archive className="mr-1.5 h-3.5 w-3.5" />
                            Archive
                          </Button>
                        </form>
                      )}
                      {tab === "archived" && (
                        <form action={restoreMyCommunityPost}>
                          <input type="hidden" name="post_id" value={post.id} />
                          <Button size="sm" variant="secondary" type="submit">
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            Restore
                          </Button>
                        </form>
                      )}
                      <form action={deleteCommunityPost}>
                        <input type="hidden" name="post_id" value={post.id} />
                        <Button size="sm" variant="ghost" type="submit" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </form>
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
