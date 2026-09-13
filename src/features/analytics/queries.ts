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

const operationalQueryMetricsSchema = z.object({
  statsReset: z.string().datetime({ offset: true }).nullable(),
  operations: z.array(z.object({
    operationCode: z.enum([
      "community_feed",
      "marketplace_directory",
      "saved_content",
      "group_posts",
      "group_search",
      "group_members",
      "group_faq",
      "people_search",
      "unified_search",
    ]),
    calls: z.number().int().nonnegative(),
    meanExecMs: z.number().nonnegative(),
    maxExecMs: z.number().nonnegative(),
    totalExecMs: z.number().nonnegative(),
    rows: z.number().int().nonnegative(),
  })),
});

export type OperationalQueryMetrics = z.infer<typeof operationalQueryMetricsSchema>;

export async function getProductAnalyticsSummary(days = 30): Promise<ProductAnalyticsSummary> {
  const { data, error } = await createAdminClient().rpc("get_product_analytics_summary", {
    p_days: Math.min(Math.max(Math.trunc(days), 1), 90),
  });
  if (error) throw new Error(`product_analytics_summary_${error.code ?? "failed"}`);
  const parsed = summarySchema.safeParse(data);
  if (!parsed.success) throw new Error("product_analytics_summary_invalid");
  return parsed.data;
}

export async function getOperationalQueryMetrics(): Promise<OperationalQueryMetrics> {
  const { data, error } = await createAdminClient().rpc("get_operational_query_metrics");
  if (error) throw new Error(`operational_query_metrics_${error.code ?? "failed"}`);
  const parsed = operationalQueryMetricsSchema.safeParse(data);
  if (!parsed.success) throw new Error("operational_query_metrics_invalid");
  return parsed.data;
}
