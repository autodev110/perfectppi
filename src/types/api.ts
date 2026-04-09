// ============================================================================
// API Request/Response shapes
// ============================================================================

import type {
  UserRole,
  VehicleVisibility,
  CertificationLevel,
  WhoseCar,
  RequesterRole,
  PerformerType,
  PpiType,
  PpiRequestStatus,
  SectionType,
  CompletionState,
  AnswerType,
  AuditAction,
} from "./enums";

// --- Auth ---
export interface SignUpRequest {
  email: string;
  password: string;
  displayName?: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

// --- Profiles ---
export interface UpdateProfileRequest {
  display_name?: string;
  username?: string;
  bio?: string;
  avatar_url?: string;
  is_public?: boolean;
}

export interface ProfileResponse {
  id: string;
  auth_user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: UserRole;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// --- Vehicles ---
export interface CreateVehicleRequest {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  mileage?: number;
  visibility?: VehicleVisibility;
}

export interface UpdateVehicleRequest {
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  mileage?: number;
  visibility?: VehicleVisibility;
}

export interface VehicleResponse {
  id: string;
  owner_id: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  mileage: number | null;
  visibility: VehicleVisibility;
  created_at: string;
  updated_at: string;
}

// --- Technicians ---
export interface UpdateTechProfileRequest {
  specialties?: string[];
  certification_level?: CertificationLevel;
  is_independent?: boolean;
}

export interface TechProfileResponse {
  id: string;
  profile_id: string;
  organization_id: string | null;
  certification_level: CertificationLevel;
  specialties: string[];
  is_independent: boolean;
  total_inspections: number;
  created_at: string;
  profile: ProfileResponse;
}

// --- Organizations ---
export interface UpdateOrgRequest {
  name?: string;
  description?: string;
  logo_url?: string;
}

// --- Upload ---
export interface PresignedUrlRequest {
  filename: string;
  contentType: string;
  entity: string;
  recordId: string;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  publicUrl: string;
}

// --- PPI ---
export interface CreatePpiRequestPayload {
  vehicle_id: string;
  vin: string;
  mileage: number;
  whose_car: WhoseCar;
  requester_role: RequesterRole;
  performer_type: PerformerType;
  assigned_tech_profile_id?: string;
}

export interface PpiMediaItem {
  id: string;
  ppi_section_id: string;
  ppi_answer_id: string | null;
  url: string;
  media_type: string;
  caption: string | null;
  captured_at: string | null;
  uploaded_at: string;
}

export interface PpiAnswerItem {
  id: string;
  ppi_section_id: string;
  prompt: string;
  answer_type: AnswerType;
  answer_value: string | null;
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
}

export interface PpiSectionItem {
  id: string;
  ppi_submission_id: string;
  section_type: SectionType;
  completion_state: CompletionState;
  notes: string | null;
  sort_order: number;
  answers: PpiAnswerItem[];
  media: PpiMediaItem[];
}

export interface PpiSubmissionResponse {
  id: string;
  ppi_request_id: string;
  performer_id: string;
  version: number;
  is_current: boolean;
  status: "draft" | "in_progress" | "submitted" | "completed";
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  sections: PpiSectionItem[];
}

export interface PpiRequestResponse {
  id: string;
  vehicle_id: string;
  requester_id: string;
  assigned_tech_id: string | null;
  whose_car: WhoseCar;
  requester_role: RequesterRole;
  performer_type: PerformerType;
  ppi_type: PpiType;
  status: PpiRequestStatus;
  created_at: string;
  updated_at: string;
  vehicle: {
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    mileage: number | null;
  } | null;
  requester: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  } | null;
  assigned_tech: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  } | null;
}

export interface SaveAnswerItem {
  answer_id: string;
  answer_value: string;
}

export interface SaveAnswersPayload {
  answers: SaveAnswerItem[];
}

export interface AttachMediaPayload {
  ppi_section_id: string;
  ppi_answer_id?: string;
  url: string;
  media_type: "image" | "video";
  caption?: string;
  captured_at?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateRequestStatusPayload {
  status: PpiRequestStatus;
}

// --- Standardized Output (Stage 1) ---
export interface StandardizedContent {
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    mileage: number | null;
  };
  inspection_metadata: {
    ppi_type: PpiType;
    performer_type: PerformerType;
    submitted_at: string;
    version: number;
  };
  performer: {
    display_name: string | null;
    role: string;
  };
  sections: StandardizedSection[];
  overall_summary: string;
  notable_findings: string[];
}

export interface StandardizedSection {
  section_type: SectionType;
  section_label: string;
  summary: string;
  condition_rating: "excellent" | "good" | "fair" | "poor" | "not_applicable";
  findings: StandardizedFinding[];
  notes: string | null;
}

export interface StandardizedFinding {
  prompt: string;
  answer: string;
  severity: "info" | "minor" | "moderate" | "major" | "critical";
}

export interface StandardizedOutputResponse {
  id: string;
  ppi_submission_id: string;
  version: number;
  document_url: string | null;
  structured_content: StandardizedContent;
  generated_at: string;
}

// --- VSC Output (Stage 2) ---
export interface VscCoverageData {
  overall_eligibility: "eligible" | "conditional" | "ineligible";
  eligibility_summary: string;
  components: VscComponentDetermination[];
}

export interface VscComponentDetermination {
  component: string;
  category: string;
  determination: "covered" | "excluded" | "limited";
  reasoning: string;
  conditions: string[];
}

export interface VscOutputResponse {
  id: string;
  ppi_submission_id: string;
  standardized_output_id: string;
  version: number;
  document_url: string | null;
  coverage_data: VscCoverageData;
  generated_at: string;
}

// --- Audit ---
export interface AuditLogEntry {
  id: string;
  actor_id: string;
  action: AuditAction;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// --- Generic ---
export interface ApiError {
  error: string;
  details?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
}
