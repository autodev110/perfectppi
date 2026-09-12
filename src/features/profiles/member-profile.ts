// The social profile another member sees (plan 9.1). One server-assembled
// DTO for web and iOS: identity, badges, relationship controls, and the
// Posts / Garage / About sections, every part already filtered by the
// canonical visibility rules in profiles/queries and community/queries.
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicProfile, getProfilePublicContent } from "@/features/profiles/queries";
import { getSocialRelationshipState } from "@/features/social/relationships";
import {
  friendsDiscoveryEnabled,
  getFriendRelationshipState,
  type FriendRelationshipState,
} from "@/features/social/friends";
import { getMemberCommunityPosts, type CommunityFeedPost } from "@/features/community/queries";
import { applyStrangerPreview } from "@/lib/social/stranger-preview";

export type MemberProfileVehicle = {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  mileage: number | null;
  visibility: string;
  created_at: string;
  vehicle_media: { url: string; is_primary: boolean; sort_order: number }[];
};

export type MemberProfileListing = {
  id: string;
  title: string;
  asking_price_cents: number;
  location: string | null;
  vehicle_id: string;
  created_at: string;
};

export type MemberProfile = {
  profile: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    /** Null when the profile is private and the viewer is not a friend. */
    bio: string | null;
    role: string;
    is_public: boolean;
    created_at: string;
    /**
     * Factual labels with definitions the client shows verbatim. Plan 26:
     * no "Verified" wording until the verification policy (proof source,
     * verifier, expiry, revocation, disputes) exists.
     */
    badges: { code: "technician_profile"; label: string; description: string }[];
  };
  relationship: {
    state: FriendRelationshipState;
    mutual_friend_count: number;
    friends_enabled: boolean;
    muted_by_me: boolean;
    blocked_by_me: boolean;
    /** True when the viewer may see friends-only content (self or accepted friend). */
    can_view_restricted: boolean;
  };
  vehicles: MemberProfileVehicle[];
  listings: MemberProfileListing[];
  posts: CommunityFeedPost[];
};

export async function getMemberProfile(
  username: string,
  options: { asStranger?: boolean } = {},
): Promise<MemberProfile | null> {
  const profile = await getPublicProfile(username);
  if (!profile) return null;

  const [content, relationship, friendship, friendsEnabled, posts, technician] = await Promise.all([
    getProfilePublicContent(profile.id),
    getSocialRelationshipState(profile.id),
    getFriendRelationshipState(profile.id),
    friendsDiscoveryEnabled(),
    getMemberCommunityPosts(profile.id),
    profile.role === "technician"
      ? createAdminClient()
          .from("technician_profiles")
          .select("id")
          .eq("profile_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const state = friendship?.state ?? "none";
  const badges: MemberProfile["profile"]["badges"] = [];
  if (profile.role === "technician" && technician.data) {
    badges.push({
      code: "technician_profile",
      label: "Technician on PerfectPPI",
      description: "This member has a technician profile and performs inspections through PerfectPPI. This is not an identity, licensing, or employment verification.",
    });
  }

  const dto: MemberProfile = {
    profile: {
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      role: profile.role,
      is_public: profile.is_public,
      created_at: profile.created_at,
      badges,
    },
    relationship: {
      state,
      mutual_friend_count: friendship?.mutualFriendCount ?? 0,
      friends_enabled: friendsEnabled,
      muted_by_me: relationship?.mutedByMe ?? false,
      blocked_by_me: relationship?.blockedByMe ?? false,
      can_view_restricted: state === "self" || state === "friends",
    },
    vehicles: content.vehicles.map((vehicle) => ({
      id: vehicle.id,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      mileage: vehicle.mileage,
      visibility: vehicle.visibility,
      created_at: vehicle.created_at,
      vehicle_media: (vehicle.vehicle_media ?? [])
        .map((media) => ({ url: media.url, is_primary: media.is_primary, sort_order: media.sort_order }))
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order),
    })),
    listings: content.listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      asking_price_cents: listing.asking_price_cents,
      location: listing.location,
      vehicle_id: listing.vehicle_id,
      created_at: listing.created_at,
    })),
    posts,
  };

  // Plan 9.3 "View as Stranger": only the owner may preview themselves.
  if (options.asStranger && state === "self") return applyStrangerPreview(dto);
  return dto;
}
