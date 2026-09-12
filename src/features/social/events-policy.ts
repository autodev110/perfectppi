export const COMMUNITY_EVENT_TYPES = [
  "car_meet",
  "track_day",
  "car_show",
  "shop_event",
  "group_drive",
] as const;

export type CommunityEventType = (typeof COMMUNITY_EVENT_TYPES)[number];

export const COMMUNITY_EVENT_TYPE_LABELS: Record<CommunityEventType, string> = {
  car_meet: "Car meet",
  track_day: "Track day",
  car_show: "Car show",
  shop_event: "Shop event",
  group_drive: "Group drive",
};

const UNSAFE_EVENT_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "street_racing", pattern: /\bstreet\s*rac(?:e|es|ing)\b/i },
  { id: "intersection_takeover", pattern: /\b(?:intersection|street)\s*takeovers?\b/i },
  { id: "sideshow", pattern: /\b(?:illegal\s+)?sideshows?\b/i },
  { id: "highway_racing", pattern: /\b(?:highway|freeway|public road)\s+(?:pulls?|races?|racing)\b/i },
  { id: "evade_police", pattern: /\b(?:run|hide|flee|escape)\s+from\s+(?:the\s+)?(?:cops?|police)\b/i },
];

export function eventSafetyRule(text: string): string | null {
  return UNSAFE_EVENT_PATTERNS.find(({ pattern }) => pattern.test(text))?.id ?? null;
}

export function buildEventAnnouncement(input: {
  title: string;
  description: string;
  eventType: CommunityEventType;
  startsAt: Date;
  generalLocation: string;
  requirements?: string | null;
}) {
  const parts = [
    input.title.trim(),
    input.description.trim(),
    `${COMMUNITY_EVENT_TYPE_LABELS[input.eventType]} · ${input.startsAt.toISOString()}`,
    `General area: ${input.generalLocation.trim()}`,
    input.requirements?.trim() ? `Requirements: ${input.requirements.trim()}` : null,
    "Free event. Exact instructions are shared only with Going attendees.",
  ];
  return parts.filter(Boolean).join("\n\n");
}
