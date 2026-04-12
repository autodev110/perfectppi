import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "display_name" | "username" | "avatar_url" | "is_public"
>;

type ReviewRow = Database["public"]["Tables"]["technician_reviews"]["Row"];

type ReviewVehicle = Pick<
  Database["public"]["Tables"]["vehicles"]["Row"],
  "id" | "year" | "make" | "model" | "trim" | "vin"
>;

export type TechnicianReview = ReviewRow & {
  reviewer: Profile | null;
  ppi_request: {
    id: string;
    created_at: string;
    vehicle: ReviewVehicle | null;
  } | null;
};

export type ReviewSummary = {
  avgRating: number;
  totalReviews: number;
  reputationScore: number;
};

const REVIEW_SELECT = `
  *,
  reviewer:profiles!technician_reviews_reviewer_id_fkey(id, display_name, username, avatar_url, is_public),
  ppi_request:ppi_requests!technician_reviews_ppi_request_id_fkey(
    id,
    created_at,
    vehicle:vehicles!ppi_requests_vehicle_id_fkey(id, year, make, model, trim, vin)
  )
`;

async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return profile ?? null;
}

export async function getPublicTechnicianReviews(technicianProfileId: string, limit = 20) {
  const admin = createAdminClient();

  const { data: reviews } = await admin
    .from("technician_reviews")
    .select(REVIEW_SELECT)
    .eq("technician_profile_id", technicianProfileId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (reviews ?? []) as TechnicianReview[];
}

export async function getTechnicianReviewSummary(
  technicianProfileId: string,
): Promise<ReviewSummary | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("technician_profiles")
    .select("avg_rating, total_reviews, reputation_score")
    .eq("id", technicianProfileId)
    .maybeSingle();

  if (!data) return null;

  return {
    avgRating: Number(data.avg_rating ?? 0),
    totalReviews: data.total_reviews ?? 0,
    reputationScore: Number(data.reputation_score ?? 0),
  };
}

export async function getMyTechnicianReviews() {
  const profile = await getCurrentProfile();
  if (!profile) return { technicianProfile: null, reviews: [] as TechnicianReview[] };

  const admin = createAdminClient();

  const { data: technicianProfile } = await admin
    .from("technician_profiles")
    .select(`
      id,
      profile_id,
      certification_level,
      avg_rating,
      total_reviews,
      reputation_score,
      profile:profiles!technician_profiles_profile_id_fkey(id, display_name, username, avatar_url)
    `)
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!technicianProfile) return { technicianProfile: null, reviews: [] as TechnicianReview[] };

  const { data: reviews } = await admin
    .from("technician_reviews")
    .select(REVIEW_SELECT)
    .eq("technician_profile_id", technicianProfile.id)
    .order("created_at", { ascending: false });

  return {
    technicianProfile,
    reviews: (reviews ?? []) as TechnicianReview[],
  };
}

export async function getMyReviewForRequest(ppiRequestId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("technician_reviews")
    .select(REVIEW_SELECT)
    .eq("ppi_request_id", ppiRequestId)
    .eq("reviewer_id", profile.id)
    .maybeSingle();

  return (data as TechnicianReview | null) ?? null;
}

export async function getReviewEligibilityForRequest(ppiRequestId: string) {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("ppi_requests")
    .select(`
      id,
      requester_id,
      assigned_tech_id,
      status,
      vehicle:vehicles!ppi_requests_vehicle_id_fkey(id, year, make, model, trim)
    `)
    .eq("id", ppiRequestId)
    .maybeSingle();

  if (!request) return null;

  const isEligible =
    request.requester_id === profile.id &&
    request.status === "completed" &&
    !!request.assigned_tech_id;

  if (!isEligible) {
    return {
      request,
      technicianProfileId: null,
      existingReview: null,
      canReview: false,
    };
  }

  const assignedTechId = request.assigned_tech_id;
  if (!assignedTechId) {
    return {
      request,
      technicianProfileId: null,
      existingReview: null,
      canReview: false,
    };
  }

  const [{ data: technicianProfile }, { data: existingReview }] = await Promise.all([
    admin
      .from("technician_profiles")
      .select("id")
      .eq("profile_id", assignedTechId)
      .maybeSingle(),
    admin
      .from("technician_reviews")
      .select(REVIEW_SELECT)
      .eq("ppi_request_id", request.id)
      .eq("reviewer_id", profile.id)
      .maybeSingle(),
  ]);

  return {
    request,
    technicianProfileId: technicianProfile?.id ?? null,
    existingReview: (existingReview as TechnicianReview | null) ?? null,
    canReview: !!technicianProfile,
  };
}
