// ============================================================================
// API Request/Response shapes
// ============================================================================

import type {
  UserRole,
  VehicleVisibility,
  CertificationLevel,
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

// --- Generic ---
export interface ApiError {
  error: string;
  details?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
}
