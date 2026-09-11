// ============================================================================
// PerfectPPI Enums — mirrors database enums + client-only types
// ============================================================================

// Domain A: Identity
export type UserRole =
  | "consumer"
  | "technician"
  | "org_manager"
  | "admin"
  | "developer";

/**
 * Roles a developer account can switch itself into, in the order they are
 * offered in settings. "developer" is included so there is a way back to the
 * switcher's own portal after landing in another role.
 */
export const SWITCHABLE_ROLES = [
  "developer",
  "consumer",
  "technician",
  "org_manager",
  "admin",
] as const satisfies readonly UserRole[];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  consumer: "Consumer",
  technician: "Technician",
  org_manager: "Organization Manager",
  admin: "Admin",
  developer: "Developer",
};

export const USER_ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  consumer: "Vehicles, listings, inspection requests, warranties.",
  technician: "Assigned inspection queue, submissions, reviews.",
  org_manager: "Organization roster, inspections, DealerSpace.",
  admin: "Platform-wide moderation, outputs, contracts, audit log.",
  developer: "This switcher. No portal data of its own.",
};

// Domain B: Vehicles
export type VehicleVisibility = "public" | "friends" | "private";
export type MediaType = "image" | "video";
export type CommunityPostAudience = "public" | "friends";

// Domain C: PPI Engine
export type WhoseCar = "own" | "other";
export type RequesterRole = "buying" | "selling" | "documenting";
export type PerformerType = "self" | "technician";

export type PpiType = "personal" | "general_tech" | "certified_tech";

/**
 * Which question set an inspection asks. Distinct from `PpiType`, which is the
 * trust tier derived from the performer's certification.
 */
export type InspectionScope = "complete" | "dents_tires";

export type PpiRequestStatus =
  | "draft"
  | "pending_assignment"
  | "assigned"
  | "accepted"
  | "in_progress"
  | "submitted"
  | "needs_revision"
  | "completed"
  | "archived";

export type PpiSubmissionStatus =
  | "draft"
  | "in_progress"
  | "submitted"
  | "completed";

export type SectionType =
  | "vehicle_basics"
  | "dashboard_warnings"
  | "exterior"
  | "interior"
  | "engine_bay"
  | "tires_brakes"
  | "suspension_steering"
  | "fluids"
  | "electrical_controls"
  | "underbody"
  | "road_test"
  | "modifications"
  // dents_tires scope only
  | "wheels_tires"
  | "body_damage";

export type CompletionState = "not_started" | "in_progress" | "completed";
export type AnswerType = "text" | "yes_no" | "select" | "number";

// Domain D: Warranty
export type WarrantyOptionStatus =
  | "not_offered"
  | "offered"
  | "viewed"
  | "selected";

export type WarrantyOrderStatus =
  | "contract_pending"
  | "signed"
  | "payment_pending"
  | "paid"
  | "failed"
  | "cancelled";

export type PaymentMethod = "card" | "bank_transfer" | "financing";
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

// Domain E: Communications
export type MessageStatus = "unread" | "read" | "archived";
export type ShareTargetType =
  | "media_package"
  | "inspection_result"
  | "standardized_output";

// Domain F: Technician
export type CertificationLevel = "none" | "ase" | "master" | "oem_qualified";
export type OrgMemberRole = "technician" | "manager";

// Domain G: Notifications
export type NotificationType =
  | "friend_request"
  | "friend_request_accepted"
  | "post_comment"
  | "post_likes"
  | "post_mention"
  | "answer_accepted"
  | "accepted_answer_unavailable"
  | "answer_helpful"
  | "group_post_removed"
  | "group_role_changed"
  | "group_invitation"
  | "group_join_request"
  | "group_join_decision"
  | "saved_listing_updated"
  | "listing_inspection_requested"
  | "moderation_decision"
  | "moderation_case"
  | "report_received"
  | "tech_request_new"
  | "tech_request_accepted"
  | "inspection_submitted"
  | "inspection_updated"
  | "warranty_available"
  | "payment_completed"
  | "message_received";

// Domain G: Audit
export type AuditAction =
  | "inspection_edited"
  | "output_regenerated"
  | "contract_state_changed"
  | "payment_state_changed"
  | "submission_resubmitted";

// PPI Trust Tier display
export const PPI_TRUST_TIERS = {
  personal: { label: "Personal PPI", badge: "Bronze", color: "amber" },
  general_tech: { label: "Technician PPI", badge: "Silver", color: "slate" },
  certified_tech: {
    label: "Certified PPI",
    badge: "Gold",
    color: "yellow",
  },
} as const;
