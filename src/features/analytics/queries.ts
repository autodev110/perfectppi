import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const summarySchema = z.object({
  windowDays: z.number().int().positive(),
  activeUsers: z.number().int().nonnegative(),
  weeklyMeaningfulUsers: z.number().int().nonnegative(),
  eligibleNewProfiles: z.number().int().nonnegative(),
  activatedNewProfiles: z.number().int().nonnegative(),
  optedInProfiles: z.number().int().nonnegative(),
  optedOutProfiles: z.number().int().nonnegative(),
  eventCounts: z.array(z.object({
    eventName: z.string(),
    eventCount: z.number().int().nonnegative(),
    userCount: z.number().int().nonnegative(),
  })),
  dailyActiveUsers: z.array(z.object({
    day: z.string(),
    userCount: z.number().int().nonnegative(),
  })),
});

export type ProductAnalyticsSummary = z.infer<typeof summarySchema>;

export async function getProductAnalyticsSummary(days = 30): Promise<ProductAnalyticsSummary> {
  const { data, error } = await createAdminClient().rpc("get_product_analytics_summary", {
    p_days: Math.min(Math.max(Math.trunc(days), 1), 90),
  });
  if (error) throw new Error(`product_analytics_summary_${error.code ?? "failed"}`);
  const parsed = summarySchema.safeParse(data);
  if (!parsed.success) throw new Error("product_analytics_summary_invalid");
  return parsed.data;
}
