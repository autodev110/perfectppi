import "server-only";

import { getCurrentSocialProfileId } from "@/features/social/relationships";
import { createAdminClient } from "@/lib/supabase/admin";

export type MemberContributionSummary = {
  accepted_answers: number;
  helpful_marks: number;
  fixed_issues: number;
  helped_issues: number;
  completed_inspections: number;
};

export const EMPTY_MEMBER_CONTRIBUTIONS: MemberContributionSummary = {
  accepted_answers: 0,
  helpful_marks: 0,
  fixed_issues: 0,
  helped_issues: 0,
  completed_inspections: 0,
};

function count(value: unknown) {
  return Math.max(0, Number(value ?? 0) || 0);
}

export async function getMemberContributionSummary(
  targetProfileId: string,
): Promise<MemberContributionSummary> {
  const viewerProfileId = await getCurrentSocialProfileId();
  if (!viewerProfileId) return EMPTY_MEMBER_CONTRIBUTIONS;

  const { data, error } = await createAdminClient().rpc("member_contribution_summary", {
    p_viewer_profile_id: viewerProfileId,
    p_target_profile_id: targetProfileId,
  });
  if (error) {
    console.error("member_contribution_summary failed", error.message);
    return EMPTY_MEMBER_CONTRIBUTIONS;
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    accepted_answers: count(raw.acceptedAnswers),
    helpful_marks: count(raw.helpfulMarks),
    fixed_issues: count(raw.fixedIssues),
    helped_issues: count(raw.helpedIssues),
    completed_inspections: count(raw.completedInspections),
  };
}
