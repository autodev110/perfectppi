// "View as stranger" (plan 9.3): reduce the owner's own full profile DTO to
// what a signed-in member with no relationship would receive. This mirrors
// the database policy rather than re-querying as a synthetic viewer:
//   * private profile → bio hidden, no vehicles/listings/posts, mutual count 0
//   * public profile  → only Public-audience general posts; friends-only
//     posts disappear
//   * no relationship state, so the owner sees the Add Friend affordance
// Pure and dependency-free so the reduction is unit-testable.

type StrangerPost = { audience: string; group_id?: string | null; report_context?: string | null; can_like?: boolean };

export type StrangerPreviewInput<P extends StrangerPost> = {
  profile: { is_public: boolean; bio: string | null };
  relationship: {
    state: string;
    mutual_friend_count: number;
    friends_enabled: boolean;
    muted_by_me: boolean;
    blocked_by_me: boolean;
    can_view_restricted: boolean;
  };
  vehicles: unknown[];
  listings: unknown[];
  posts: P[];
  contributions: unknown | null;
};

export function applyStrangerPreview<T extends StrangerPreviewInput<P>, P extends StrangerPost>(dto: T): T {
  const isPublic = dto.profile.is_public;
  return {
    ...dto,
    profile: { ...dto.profile, bio: isPublic ? dto.profile.bio : null },
    relationship: {
      ...dto.relationship,
      state: "none",
      mutual_friend_count: 0,
      muted_by_me: false,
      blocked_by_me: false,
      can_view_restricted: false,
    },
    vehicles: isPublic ? dto.vehicles : [],
    listings: isPublic ? dto.listings : [],
    // The owner-view contains counts from content visible to the owner,
    // including friends/groups. Do not reuse those totals for a stranger.
    contributions: null,
    posts: isPublic
      ? dto.posts
          .filter((post) => post.audience === "public" && !post.group_id)
          // The owner is previewing: no report token and no self-like.
          .map((post) => ({ ...post, report_context: null, can_like: false }))
      : [],
  };
}
