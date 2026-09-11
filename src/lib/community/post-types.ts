// Structured post types (plan 14.2). Client-safe: labels, composer field
// definitions, and the zod shapes that mirror the database trigger
// `validate_community_post_details`, so the composer can say why before the
// server does.
import { z } from "zod";

export const POST_TYPES = [
  "general",
  "question",
  "build_update",
  "maintenance",
  "before_after",
  "inspection_discussion",
  "buying_advice",
  "poll",
] as const;
export type PostType = (typeof POST_TYPES)[number];

export const POST_TYPE_LABELS: Record<PostType, { label: string; chip: string; prompt: string }> = {
  general: { label: "General", chip: "", prompt: "What's happening with your car?" },
  question: { label: "Question / Troubleshooting", chip: "Question", prompt: "Describe the symptom, when it happens, and what you've tried." },
  build_update: { label: "Build Update", chip: "Build", prompt: "What did you change, and how does it feel?" },
  maintenance: { label: "Maintenance / Repair", chip: "Maintenance", prompt: "What was done, and anything the next owner should know?" },
  before_after: { label: "Before & After", chip: "Before / After", prompt: "First photo is before, second is after. What changed?" },
  inspection_discussion: { label: "Inspection Discussion", chip: "Inspection", prompt: "What would you like the community's take on? (No report findings are shared automatically.)" },
  buying_advice: { label: "Buying Advice", chip: "Buying advice", prompt: "What are you considering, and what matters most to you?" },
  poll: { label: "Poll", chip: "Poll", prompt: "Ask the question your options answer." },
};

export const BUILD_STAGES = ["planning", "in_progress", "complete"] as const;
export const BUILD_STAGE_LABELS: Record<(typeof BUILD_STAGES)[number], string> = {
  planning: "Planning", in_progress: "In progress", complete: "Complete",
};
export const POLL_DURATIONS = [24, 72, 168] as const;
export const POLL_DURATION_LABELS: Record<(typeof POLL_DURATIONS)[number], string> = { 24: "24 hours", 72: "3 days", 168: "7 days" };

const shortList = (max: number, length: number) => z.array(z.string().trim().min(1).max(length)).max(max);
const money = z.number().int().min(0).max(100_000_000);

export const buildUpdateDetails = z.object({
  stage: z.enum(BUILD_STAGES),
  parts: shortList(10, 60).optional(),
}).strict();

export const maintenanceDetails = z.object({
  service: z.string().trim().min(1, "Say what was done").max(80),
  mileage: z.number().int().min(0).max(2_000_000).optional(),
  cost_cents: money.optional(),
  diy: z.boolean().optional(),
  parts: shortList(10, 60).optional(),
}).strict();

export const inspectionDiscussionDetails = z.object({
  inspection_request_id: z.string().uuid(),
}).strict();

export const buyingAdviceDetails = z.object({
  budget_cents: money.optional(),
  year_min: z.number().int().min(1886).max(2100).optional(),
  year_max: z.number().int().min(1886).max(2100).optional(),
  makes: shortList(5, 40).optional(),
  use_case: z.string().trim().min(1).max(120).optional(),
}).strict().refine((value) => !value.year_min || !value.year_max || value.year_min <= value.year_max, {
  message: "The first year must not be after the last year",
  path: ["year_max"],
});

export const pollOptionSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]{1,32}$/),
  label: z.string().trim().min(1, "Options can't be empty").max(80),
});
export const pollDetails = z.object({
  poll: z.object({
    duration_hours: z.union([z.literal(24), z.literal(72), z.literal(168)]),
    options: z.array(pollOptionSchema).min(2, "Add at least two options").max(6, "Up to six options")
      .refine((options) => new Set(options.map((option) => option.key)).size === options.length, "Options must be distinct"),
  }),
}).strict();

export type BuildUpdateDetails = z.infer<typeof buildUpdateDetails>;
export type MaintenanceDetails = z.infer<typeof maintenanceDetails>;
export type InspectionDiscussionDetails = z.infer<typeof inspectionDiscussionDetails>;
export type BuyingAdviceDetails = z.infer<typeof buyingAdviceDetails>;
export type PollDetails = z.infer<typeof pollDetails>;

/** Validate details for a type; general/question/before_after carry none. */
export function parsePostDetails(postType: PostType, raw: unknown): { ok: true; details: Record<string, unknown> } | { ok: false; message: string } {
  const value = raw && typeof raw === "object" ? raw : {};
  const schema = postType === "build_update" ? buildUpdateDetails
    : postType === "maintenance" ? maintenanceDetails
      : postType === "inspection_discussion" ? inspectionDiscussionDetails
        : postType === "buying_advice" ? buyingAdviceDetails
          : postType === "poll" ? pollDetails
            : z.object({}).strict();
  const parsed = schema.safeParse(value);
  if (!parsed.success) return { ok: false, message: parsed.error.errors[0]?.message ?? "Check the post details." };
  return { ok: true, details: parsed.data as Record<string, unknown> };
}

/** Composer helper: option labels → stable keys the database and votes use. */
export function pollOptionsFromLabels(labels: string[]) {
  return labels.map((label, index) => ({ key: `opt${index + 1}`, label: label.trim() })).filter((option) => option.label.length > 0);
}

export function postTypeRequiresPhotos(postType: PostType): number {
  return postType === "before_after" ? 2 : 0;
}

export function postTypeRequiresVehicle(postType: PostType): boolean {
  return postType === "inspection_discussion";
}
