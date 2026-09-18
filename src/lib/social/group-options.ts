
import { t as uiText } from "./../i18n/index.ts";
// Client-safe group category options (leaf module).
export const GROUP_CATEGORIES = [
  "make_model", "technical", "detailing", "off_road", "restoration",
  "track", "classics", "ev", "local_club", "general",
] as const;
export type GroupCategory = (typeof GROUP_CATEGORIES)[number];

export const GROUP_CATEGORY_LABELS: Record<GroupCategory, string> = {
  make_model: uiText("ui.make_model_9ccbd9f476"),
  technical: uiText("ui.technical_e851504f43"),
  detailing: uiText("ui.detailing_c292c9e124"),
  off_road: uiText("ui.off_road_997e67eb7e"),
  restoration: uiText("ui.restoration_6a3c6c7789"),
  track: uiText("ui.track_autocross_30bce0ac6e"),
  classics: uiText("ui.classics_731b1bb35c"),
  ev: uiText("ui.ev_ownership_e083faeceb"),
  local_club: uiText("ui.local_club_e03102f788"),
  general: uiText("ui.general_c910d474dc"),
};

// Visibility / join-policy combinations (plan 13.3). Public groups support all
// three policies; private and unlisted groups require requests or invitations.
export const GROUP_VISIBILITIES = ["public", "private", "unlisted"] as const;
export type GroupVisibilityOption = (typeof GROUP_VISIBILITIES)[number];
export const GROUP_JOIN_POLICIES = ["open", "request_approval", "invite_only"] as const;
export type GroupJoinPolicyOption = (typeof GROUP_JOIN_POLICIES)[number];

export const GROUP_VISIBILITY_LABELS: Record<GroupVisibilityOption, { label: string; hint: string }> = {
  public: { label: uiText("ui.public_591935b15b"), hint: uiText("ui.listed_in_the_directory_anyone_signed_in_can_d28e259e9b") },
  private: { label: uiText("ui.private_c63eb6720c"), hint: uiText("ui.listed_in_the_directory_only_members_can_rea_bce9f0d5e6") },
  unlisted: { label: uiText("ui.unlisted_bc96567e77"), hint: uiText("ui.hidden_from_the_directory_reached_by_link_or_0c6a3b5854") },
};

export const GROUP_JOIN_POLICY_LABELS: Record<GroupJoinPolicyOption, { label: string; hint: string }> = {
  open: { label: uiText("ui.open_ed077f3d81"), hint: uiText("ui.anyone_can_join_instantly_3abbf3c472") },
  request_approval: { label: uiText("ui.request_approval_e013d99a98"), hint: uiText("ui.members_ask_to_join_moderators_approve_d17e5ce162") },
  invite_only: { label: uiText("ui.invite_only_8e76da24ab"), hint: uiText("ui.moderators_invite_members_9d8a0c9a48") },
};

export function allowedJoinPolicies(visibility: GroupVisibilityOption): readonly GroupJoinPolicyOption[] {
  return visibility === "public" ? GROUP_JOIN_POLICIES : (["request_approval", "invite_only"] as const);
}

export function isAllowedGroupPolicy(visibility: GroupVisibilityOption, joinPolicy: GroupJoinPolicyOption) {
  return allowedJoinPolicies(visibility).includes(joinPolicy);
}
