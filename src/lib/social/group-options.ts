// Client-safe group category options (leaf module).
export const GROUP_CATEGORIES = [
  "make_model", "technical", "detailing", "off_road", "restoration",
  "track", "classics", "ev", "local_club", "general",
] as const;
export type GroupCategory = (typeof GROUP_CATEGORIES)[number];

export const GROUP_CATEGORY_LABELS: Record<GroupCategory, string> = {
  make_model: "Make / model",
  technical: "Technical",
  detailing: "Detailing",
  off_road: "Off-road",
  restoration: "Restoration",
  track: "Track & autocross",
  classics: "Classics",
  ev: "EV ownership",
  local_club: "Local club",
  general: "General",
};

// Visibility / join-policy combinations (plan 13.3). Public groups support all
// three policies; private and unlisted groups require requests or invitations.
export const GROUP_VISIBILITIES = ["public", "private", "unlisted"] as const;
export type GroupVisibilityOption = (typeof GROUP_VISIBILITIES)[number];
export const GROUP_JOIN_POLICIES = ["open", "request_approval", "invite_only"] as const;
export type GroupJoinPolicyOption = (typeof GROUP_JOIN_POLICIES)[number];

export const GROUP_VISIBILITY_LABELS: Record<GroupVisibilityOption, { label: string; hint: string }> = {
  public: { label: "Public", hint: "Listed in the directory; anyone signed in can read posts." },
  private: { label: "Private", hint: "Listed in the directory; only members can read posts." },
  unlisted: { label: "Unlisted", hint: "Hidden from the directory; reached by link or invitation. Members only." },
};

export const GROUP_JOIN_POLICY_LABELS: Record<GroupJoinPolicyOption, { label: string; hint: string }> = {
  open: { label: "Open", hint: "Anyone can join instantly." },
  request_approval: { label: "Request approval", hint: "Members ask to join; moderators approve." },
  invite_only: { label: "Invite only", hint: "Moderators invite members." },
};

export function allowedJoinPolicies(visibility: GroupVisibilityOption): readonly GroupJoinPolicyOption[] {
  return visibility === "public" ? GROUP_JOIN_POLICIES : (["request_approval", "invite_only"] as const);
}

export function isAllowedGroupPolicy(visibility: GroupVisibilityOption, joinPolicy: GroupJoinPolicyOption) {
  return allowedJoinPolicies(visibility).includes(joinPolicy);
}
