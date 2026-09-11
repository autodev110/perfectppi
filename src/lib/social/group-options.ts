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
