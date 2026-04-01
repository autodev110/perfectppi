// ============================================================================
// PerfectPPI Enums — mirrors database enums + client-only types
// ============================================================================

// Domain A: Identity
export type UserRole = "consumer" | "technician" | "org_manager" | "admin";

// Domain B: Vehicles
export type VehicleVisibility = "public" | "private";
export type MediaType = "image" | "video";

// Domain C: PPI Engine
export type WhoseCar = "own" | "other";
export type RequesterRole = "buying" | "selling" | "documenting";
export type PerformerType = "self" | "technician";

export type PpiType = "personal" | "general_tech" | "certified_tech";

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
  | "modifications";

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
