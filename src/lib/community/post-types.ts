// Structured post types (plan 14.2). Client-safe: labels, composer field
// definitions, and the zod shapes that mirror the database trigger
// `validate_community_post_details`, so the composer can say why before the
// server does.
import { z } from "zod";
import { t as uiText } from "./../i18n/index.ts";


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
  general: { label: uiText("ui.general_c910d474dc"), chip: "", prompt: uiText("ui.what_s_happening_with_your_car_09cf331e82") },
  question: { label: uiText("ui.question_troubleshooting_39bbe51bc7"), chip: uiText("ui.question_289aff12b0"), prompt: uiText("ui.describe_the_symptom_when_it_happens_and_wha_ad9454bc71") },
  build_update: { label: uiText("ui.build_update_cc177bce41"), chip: uiText("ui.build_bdd254b65b"), prompt: uiText("ui.what_did_you_change_and_how_does_it_feel_9290096d33") },
  maintenance: { label: uiText("ui.maintenance_repair_d3a7c9367e"), chip: uiText("ui.maintenance_17ccfa5b68"), prompt: uiText("ui.what_was_done_and_anything_the_next_owner_sh_f3493e7804") },
  before_after: { label: uiText("ui.before_after_e837bd59ab"), chip: uiText("ui.before_after_419a9bb270"), prompt: uiText("ui.first_photo_is_before_second_is_after_what_c_f16564c740") },
  inspection_discussion: { label: uiText("ui.inspection_discussion_7ca8fcf780"), chip: uiText("ui.inspection_6e4fa13da4"), prompt: uiText("ui.what_would_you_like_the_community_s_take_on__d1940414c3") },
  buying_advice: { label: uiText("ui.buying_advice_8d92bbe52f"), chip: uiText("ui.buying_advice_3dd66cfd77"), prompt: uiText("ui.what_are_you_considering_and_what_matters_mo_1b0d96106b") },
  poll: { label: uiText("ui.poll_d54f7d124c"), chip: uiText("ui.poll_d54f7d124c"), prompt: uiText("ui.ask_the_question_your_options_answer_367fb013a4") },
};

export const BUILD_STAGES = ["planning", "in_progress", "complete"] as const;
export const BUILD_STAGE_LABELS: Record<(typeof BUILD_STAGES)[number], string> = {
  planning: uiText("ui.planning_21cc305095"), in_progress: uiText("ui.in_progress_c1f88e9d6c"), complete: uiText("ui.complete_143b270a32"),
};
export const POLL_DURATIONS = [24, 72, 168] as const;
export const POLL_DURATION_LABELS: Record<(typeof POLL_DURATIONS)[number], string> = { 24: uiText("ui.24_hours_f0514e8df8"), 72: uiText("ui.3_days_360719440e"), 168: uiText("ui.7_days_7f920bb639") };

const shortList = (max: number, length: number) => z.array(z.string().trim().min(1).max(length)).max(max);
const money = z.number().int().min(0).max(100_000_000);

export const buildUpdateDetails = z.object({
  stage: z.enum(BUILD_STAGES),
  parts: shortList(10, 60).optional(),
}).strict();

export const maintenanceDetails = z.object({
  service: z.string().trim().min(1, uiText("ui.say_what_was_done_e2318ca3c3")).max(80),
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
  message: uiText("ui.the_first_year_must_not_be_after_the_last_ye_c35ed3f79d"),
  path: ["year_max"],
});

export const pollOptionSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]{1,32}$/),
  label: z.string().trim().min(1, uiText("ui.options_can_t_be_empty_c821e8b9d4")).max(80),
});
export const pollDetails = z.object({
  poll: z.object({
    duration_hours: z.union([z.literal(24), z.literal(72), z.literal(168)]),
    options: z.array(pollOptionSchema).min(2, uiText("ui.add_at_least_two_options_0e9e9efc61")).max(6, uiText("ui.up_to_six_options_436f1140b5"))
      .refine((options) => new Set(options.map((option) => option.key)).size === options.length, uiText("ui.options_must_be_distinct_3fef2db80a")),
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
  if (!parsed.success) return { ok: false, message: parsed.error.errors[0]?.message ?? uiText("ui.check_the_post_details_d7754ba80a") };
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
