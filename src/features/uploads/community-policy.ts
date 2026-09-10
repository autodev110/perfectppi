import { NextResponse } from "next/server";
import { FEATURE_UNAVAILABLE_MESSAGE, getFeatureFlags } from "@/lib/feature-flags";
import { PUBLICATION_OUTCOME_MESSAGES, PUBLICATION_OUTCOME_STATUS } from "@/lib/moderation/launch-policy";
import { getActivePostingRestriction } from "@/lib/moderation";

/**
 * Community upload reservations obey the launch flags at every layer (plan
 * 21.3): video is refused before any byte is stored, even from older clients,
 * and photo reservations stop while the photo kill switch is off.
 */
export async function communityUploadRefusal(
  entity: string,
  isVideo: boolean,
  profileId?: string,
): Promise<NextResponse | null> {
  if (entity !== "community_post") return null;
  const flags = await getFeatureFlags();
  if (isVideo && !flags.flags.community_video_uploads) {
    return NextResponse.json(
      { error: PUBLICATION_OUTCOME_MESSAGES.unsupported_media, code: "unsupported_media" },
      { status: PUBLICATION_OUTCOME_STATUS.unsupported_media },
    );
  }
  if (!flags.flags.community_photo_uploads) {
    return NextResponse.json(
      { error: FEATURE_UNAVAILABLE_MESSAGE.community_photo_uploads, code: "posting_unavailable" },
      { status: PUBLICATION_OUTCOME_STATUS.posting_unavailable },
    );
  }
  if (profileId && await getActivePostingRestriction(profileId, true)) {
    return NextResponse.json(
      { error: PUBLICATION_OUTCOME_MESSAGES.posting_restricted, code: "posting_restricted" },
      { status: PUBLICATION_OUTCOME_STATUS.posting_restricted },
    );
  }
  return null;
}
