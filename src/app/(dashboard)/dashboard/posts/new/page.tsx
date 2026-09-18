import { getCommunityPostOptions } from "@/features/community/queries";
import { getFeatureFlags, toClientCapabilities } from "@/lib/feature-flags";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewPostForm } from "./new-post-form";
import { getCommunityEvent } from "@/features/social/events";

import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NewDashboardPostPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string; group?: string; event?: string }>;
}) {
  const uiText = await getRequestTranslator();
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
        <h1 className="font-heading text-2xl font-bold">{eventPhotoContext ? uiText("ui.add_event_photos_0da7720b31") : uiText("ui.create_community_post_4873a33fc7")}</h1>
        <p className="text-muted-foreground">
          {eventPhotoContext
            ? uiText("ui.share_photos_from_photos_use_the_normal_comm_fabc4314de", { arg0: String(eventPhotoContext.title) })
            : uiText("ui.share_public_vehicle_context_an_active_listi_35963c615b")}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{uiText("ui.post_details_1a14ed2baf")}</CardTitle>
        </CardHeader>
        <CardContent>
          {requestedEventId && !eventPhotoContext ? (
            <p className="text-sm text-muted-foreground">{uiText("ui.event_photos_open_when_the_event_starts_for__8bb8f0e676")}</p>
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
            <p className="text-sm text-muted-foreground">{uiText("ui.community_posting_is_temporarily_unavailable_c01f2167f8")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
