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

const retentionSchema = z.object({
  eligibleUsers: z.number().int().nonnegative(),
  retainedUsers: z.number().int().nonnegative(),
  ratePercent: z.number().nonnegative(),
});

const productSafetyAnalyticsSchema = z.object({
  windowDays: z.number().int().positive(),
  product: z.object({
    friendRequestsSent: z.number().int().nonnegative(),
    friendRequestsAccepted: z.number().int().nonnegative(),
    friendAcceptanceRatePercent: z.number().nonnegative(),
    technicalPostSaves: z.number().int().nonnegative(),
    technicalPostSavers: z.number().int().nonnegative(),
    questionsPublished: z.number().int().nonnegative(),
    questionsAnsweredWithin24Hours: z.number().int().nonnegative(),
    questionsWithAcceptedAnswer: z.number().int().nonnegative(),
    answeredWithin24HoursRatePercent: z.number().nonnegative(),
    acceptedAnswerRatePercent: z.number().nonnegative(),
    retainedGroupParticipants: z.number().int().nonnegative(),
    d7Retention: retentionSchema,
    d30Retention: retentionSchema,
    marketplaceFunnel: z.array(z.object({
      stage: z.enum([
        "listing_viewed",
        "report_viewed",
        "seller_message_started",
        "inspection_requested",
        "inspection_completed",
      ]),
      eventCount: z.number().int().nonnegative(),
      userCount: z.number().int().nonnegative(),
    })),
  }),
  safety: z.object({
    reportCount: z.number().int().nonnegative(),
    publishedItems: z.number().int().nonnegative(),
    reportsPerThousandItems: z.number().nonnegative(),
    reportBreakdown: z.array(z.object({
      surface: z.enum(["community_post", "community_comment"]),
      reasonCode: z.string(),
      reportCount: z.number().int().nonnegative(),
    })),
    reportBreakdownSuppressed: z.boolean(),
    review: z.object({
      closedCases: z.number().int().nonnegative(),
      medianHours: z.number().nonnegative().nullable(),
      p95Hours: z.number().nonnegative().nullable(),
    }),
    decisions: z.object({
      closedCases: z.number().int().nonnegative(),
      restored: z.number().int().nonnegative(),
      confirmedViolations: z.number().int().nonnegative(),
      restoreRatePercent: z.number().nonnegative(),
      confirmedViolationRatePercent: z.number().nonnegative(),
    }),
    appeals: z.object({
      decided: z.number().int().nonnegative(),
      overturned: z.number().int().nonnegative(),
      overturnRatePercent: z.number().nonnegative(),
    }),
    repeatViolationAuthors: z.number().int().nonnegative(),
    repeatedNonviolatingReporters: z.number().int().nonnegative(),
    hiddenMediaPublicReferences: z.number().int().nonnegative(),
    visibilityIntegrityViolations: z.number().int().nonnegative(),
    blocksCreated: z.number().int().nonnegative(),
    blockActors: z.number().int().nonnegative(),
    mutesCreated: z.number().int().nonnegative(),
    muteActors: z.number().int().nonnegative(),
    notificationOptOut: z.object({
      eligibleProfiles: z.number().int().nonnegative(),
      optedOutProfiles: z.number().int().nonnegative(),
      ratePercent: z.number().nonnegative(),
    }),
    queue: z.object({
      openCases: z.number().int().nonnegative(),
      overdueCases: z.number().int().nonnegative(),
      dueWithin2Hours: z.number().int().nonnegative(),
      urgentUnacknowledged: z.number().int().nonnegative(),
    }),
  }),
});

export type ProductSafetyAnalyticsSummary = z.infer<typeof productSafetyAnalyticsSchema>;

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

export async function getProductSafetyAnalyticsSummary(days = 30): Promise<ProductSafetyAnalyticsSummary> {
  const { data, error } = await createAdminClient().rpc("get_product_safety_analytics_summary", {
    p_days: Math.min(Math.max(Math.trunc(days), 1), 90),
  });
  if (error) throw new Error(`product_safety_analytics_summary_${error.code ?? "failed"}`);
  const parsed = productSafetyAnalyticsSchema.safeParse(data);
  if (!parsed.success) throw new Error("product_safety_analytics_summary_invalid");
  return parsed.data;
}

// Renditions-doc KPIs: search, network activation, invite conversion,
// vehicle-profile accuracy, custom-build adoption. Counts and rates only.
const growthAccuracyKpisSchema = z.object({
  windowDays: z.number().int().positive(),
  search: z.object({ searches: z.number().int().nonnegative(), searchers: z.number().int().nonnegative() }),
  network: z.object({
    contactMatches: z.number().int().nonnegative(),
    membersWithContactMatches: z.number().int().nonnegative(),
    activatedAfterContactMatch: z.number().int().nonnegative(),
    activationRatePercent: z.number().nonnegative(),
  }),
  invites: z.object({
    shared: z.number().int().nonnegative(),
    inviters: z.number().int().nonnegative(),
    signups: z.number().int().nonnegative(),
    conversionRatePercent: z.number().nonnegative(),
  }),
  accuracy: z.object({
    vehicles: z.number().int().nonnegative(),
    vehiclesWithVin: z.number().int().nonnegative(),
    vehiclesWithFactorySpec: z.number().int().nonnegative(),
    factoryCoveragePercent: z.number().nonnegative(),
    factorySpecsRecorded: z.number().int().nonnegative(),
    factoryConflictsRefused: z.number().int().nonnegative(),
    membersWithRefusedConflicts: z.number().int().nonnegative(),
  }),
  customBuilds: z.object({
    declared: z.number().int().nonnegative(),
    customBuildVehicles: z.number().int().nonnegative(),
    modifiedVehicles: z.number().int().nonnegative(),
    stagesCreated: z.number().int().nonnegative(),
    membersCreatingStages: z.number().int().nonnegative(),
    vehiclesWithStages: z.number().int().nonnegative(),
  }),
});

export type GrowthAccuracyKpis = z.infer<typeof growthAccuracyKpisSchema>;

export async function getGrowthAccuracyKpis(days = 30): Promise<GrowthAccuracyKpis> {
  const { data, error } = await createAdminClient().rpc("get_growth_accuracy_kpis", {
    p_days: Math.min(Math.max(Math.trunc(days), 1), 90),
  });
  if (error) throw new Error(`growth_accuracy_kpis_${error.code ?? "failed"}`);
  const parsed = growthAccuracyKpisSchema.safeParse(data);
  if (!parsed.success) throw new Error("growth_accuracy_kpis_invalid");
  return parsed.data;
}
