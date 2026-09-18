
import { t as uiText } from "./../../lib/i18n/index.ts";
export const COMMUNITY_EVENT_TYPES = [
  "car_meet",
  "track_day",
  "car_show",
  "shop_event",
  "group_drive",
] as const;

export type CommunityEventType = (typeof COMMUNITY_EVENT_TYPES)[number];

export const COMMUNITY_EVENT_TYPE_LABELS: Record<CommunityEventType, string> = {
  car_meet: uiText("ui.car_meet_26d52b1a3f"),
  track_day: uiText("ui.track_day_c048f69585"),
  car_show: uiText("ui.car_show_74dbe36bee"),
  shop_event: uiText("ui.shop_event_3462225409"),
  group_drive: uiText("ui.group_drive_61dba33fa2"),
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
    uiText("ui.general_area_6c10d82063", { arg0: String(input.generalLocation.trim()) }),
    input.requirements?.trim() ? uiText("ui.requirements_4711dd0adf", { arg0: String(input.requirements.trim()) }) : null,
    uiText("ui.free_event_exact_instructions_are_shared_onl_2c81549bc5"),
  ];
  return parts.filter(Boolean).join("\n\n");
}
