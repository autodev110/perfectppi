export type ModerationEntityType =
  | "community_post"
  | "community_comment"
  | "community_post_media"
  | "vehicle_media";

export type ModerationDecision = "allow" | "warn" | "review" | "block" | "legal_hold";
export type ModerationRisk = "none" | "low" | "medium" | "high" | "critical";
export type ModerationStatus = "pending_scan" | "active" | "pending_review" | "rejected" | "legal_hold";

export type ModerationResult = {
  decision: ModerationDecision;
  riskLevel: ModerationRisk;
  reasonCodes: string[];
  provider: string;
  modelName: string | null;
  modelVersion: string;
  rawResult: Record<string, unknown>;
};

export function statusForDecision(decision: ModerationDecision): ModerationStatus {
  if (decision === "allow") return "active";
  if (decision === "block") return "rejected";
  if (decision === "legal_hold") return "legal_hold";
  return "pending_review";
}

export function publicStatusForDecision(decision: ModerationDecision): "active" | "hidden" {
  return decision === "allow" ? "active" : "hidden";
}

export function moderationUserMessage(decision: ModerationDecision): string | null {
  if (decision === "allow") return null;
  if (decision === "warn" || decision === "review") {
    return "Your content was submitted for review and is not public yet.";
  }
  return "This content cannot be published because it may not follow PerfectPPI community guidelines.";
}
