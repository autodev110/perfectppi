import { getCommunityPostOptions } from "@/features/community/queries";
import { getFeatureFlags, toClientCapabilities } from "@/lib/feature-flags";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewPostForm } from "./new-post-form";

export const dynamic = "force-dynamic";

export default async function NewDashboardPostPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string; group?: string }>;
}) {
  const { vehicle: requestedVehicleId, group: requestedGroupSlug } = await searchParams;
  const [{ vehicles, listings, groups, defaultAudience, canPostPublic }, flags] = await Promise.all([
    getCommunityPostOptions(),
    getFeatureFlags(),
  ]);
  const { capabilities } = toClientCapabilities(flags);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Create Community Post</h1>
        <p className="text-muted-foreground">
          Share public vehicle context, an active listing, or a factual inspection discussion.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Post Details</CardTitle>
        </CardHeader>
        <CardContent>
          {capabilities.communityTextPosts ? (
            <NewPostForm
              vehicles={vehicles}
              listings={listings}
              groups={groups}
              selectedVehicleId={requestedVehicleId}
              selectedGroupSlug={requestedGroupSlug}
              defaultAudience={defaultAudience}
              canPostPublic={canPostPublic}
              capabilities={capabilities}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Community posting is temporarily unavailable. Please try again later.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
