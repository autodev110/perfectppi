import Link from "next/link";
import { updateCommunityPostStatus } from "@/features/community/actions";
import { getAdminCommunityPosts } from "@/features/community/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/formatting";
import { ExternalLink, MessageSquare } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-teal/10 text-teal border-teal/20",
  hidden: "bg-warning/10 text-warning border-warning/20",
  archived: "bg-surface-container text-on-surface-variant border-outline-variant",
};

function getVehicleName(vehicle: { year: number | null; make: string | null; model: string | null; trim: string | null } | null) {
  return [vehicle?.year, vehicle?.make, vehicle?.model, vehicle?.trim].filter(Boolean).join(" ");
}

export default async function AdminCommunityPage() {
  const { posts, total } = await getAdminCommunityPosts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Community Moderation</h1>
        <p className="text-muted-foreground">
          Review community posts and hide anything that should not stay public.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Posts ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No community posts yet.</p>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => {
                const vehicleName = getVehicleName(post.vehicle);
                return (
                  <div key={post.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={STATUS_BADGE[post.status]}>{post.status}</Badge>
                          <Badge variant="secondary">
                            {post.author?.display_name ?? post.author?.username ?? "PerfectPPI user"}
                          </Badge>
                          {vehicleName && <Badge variant="secondary">{vehicleName}</Badge>}
                        </div>
                        <p className="max-w-4xl whitespace-pre-wrap text-sm text-muted-foreground">{post.content}</p>
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
                        {post.status !== "active" && (
                          <form action={updateCommunityPostStatus}>
                            <input type="hidden" name="post_id" value={post.id} />
                            <input type="hidden" name="status" value="active" />
                            <Button size="sm" variant="secondary" type="submit">Make Active</Button>
                          </form>
                        )}
                        {post.status !== "hidden" && (
                          <form action={updateCommunityPostStatus}>
                            <input type="hidden" name="post_id" value={post.id} />
                            <input type="hidden" name="status" value="hidden" />
                            <Button size="sm" variant="secondary" type="submit">Hide</Button>
                          </form>
                        )}
                        {post.status !== "archived" && (
                          <form action={updateCommunityPostStatus}>
                            <input type="hidden" name="post_id" value={post.id} />
                            <input type="hidden" name="status" value="archived" />
                            <Button size="sm" variant="ghost" type="submit">Archive</Button>
                          </form>
                        )}
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
