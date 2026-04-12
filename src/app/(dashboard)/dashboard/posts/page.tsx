import Link from "next/link";
import { archiveMyCommunityPost } from "@/features/community/actions";
import { getMyCommunityPosts } from "@/features/community/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/formatting";
import { ExternalLink, MessageSquare, Plus, Users } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-teal/10 text-teal border-teal/20",
  hidden: "bg-warning/10 text-warning border-warning/20",
  archived: "bg-surface-container text-on-surface-variant border-outline-variant",
};

function getVehicleName(vehicle: { year: number | null; make: string | null; model: string | null; trim: string | null } | null) {
  return [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ");
}

export default async function DashboardPostsPage() {
  const posts = await getMyCommunityPosts();

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

      {posts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">No community posts yet</p>
            <p className="mb-4 max-w-md text-sm text-muted-foreground">
              Share a public vehicle, active listing, or inspection discussion when it is ready for buyers to see.
            </p>
            <Button asChild>
              <Link href="/dashboard/posts/new">Create Post</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => {
            const vehicleName = getVehicleName(post.vehicle);

            return (
              <Card key={post.id}>
                <CardContent className="p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={STATUS_BADGE[post.status]}>{post.status}</Badge>
                        {vehicleName && <Badge variant="secondary">{vehicleName}</Badge>}
                        {post.marketplace_listing && <Badge variant="secondary">Listing shared</Badge>}
                      </div>
                      <p className="max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">{post.content}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>Created {formatDate(post.created_at)}</span>
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
                      {post.status === "active" && (
                        <form action={archiveMyCommunityPost}>
                          <input type="hidden" name="post_id" value={post.id} />
                          <Button size="sm" variant="ghost" type="submit">Archive</Button>
                        </form>
                      )}
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
