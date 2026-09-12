import { getCommunityPostOptions } from "@/features/community/queries";
import { getFeatureFlags, toClientCapabilities } from "@/lib/feature-flags";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewPostForm } from "./new-post-form";
import { getCommunityEvent } from "@/features/social/events";

export const dynamic = "force-dynamic";

export default async function NewDashboardPostPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string; group?: string; event?: string }>;
}) {
  const { vehicle: requestedVehicleId, group: requestedGroupSlug, event: requestedEventId } = await searchParams;
  const [{ vehicles, listings, groups, inspections, defaultAudience, canPostPublic }, flags, event] = await Promise.all([
    getCommunityPostOptions(),
    getFeatureFlags(),
    requestedEventId ? getCommunityEvent(requestedEventId) : Promise.resolve(null),
  ]);
  const { capabilities } = toClientCapabilities(flags);
  const eventPhotoContext = event?.can_contribute_photos ? {
    id: event.id,
    title: event.title,
    groupId: event.group_id,
    groupSlug: event.group?.slug ?? null,
  } : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{eventPhotoContext ? "Add Event Photos" : "Create Community Post"}</h1>
        <p className="text-muted-foreground">
          {eventPhotoContext
            ? `Share photos from ${eventPhotoContext.title}. Photos use the normal Community safety review.`
            : "Share public vehicle context, an active listing, or a factual inspection discussion."}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Post Details</CardTitle>
        </CardHeader>
        <CardContent>
          {requestedEventId && !eventPhotoContext ? (
            <p className="text-sm text-muted-foreground">
              Event photos open when the event starts for the organizer and members marked Going.
            </p>
          ) : capabilities.communityTextPosts ? (
            <NewPostForm
              vehicles={vehicles}
              listings={listings}
              groups={groups}
              inspections={inspections}
              selectedVehicleId={requestedVehicleId}
              selectedGroupSlug={requestedGroupSlug}
              defaultAudience={defaultAudience}
              canPostPublic={canPostPublic}
              capabilities={capabilities}
              eventPhotoContext={eventPhotoContext}
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
