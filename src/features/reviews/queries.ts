import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { unavailableEntityIds } from "@/features/moderation/extended-reporting";

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
  const viewer = await getCurrentProfile();

  const { data: reviews } = await admin
    .from("technician_reviews")
    .select(REVIEW_SELECT)
    .eq("technician_profile_id", technicianProfileId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (reviews ?? []) as TechnicianReview[];
  const hidden = await unavailableEntityIds(viewer?.id ?? null, "review", rows.map((review) => review.id));
  return rows.filter((review) => !hidden.has(review.id));
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
      updated_at,
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
      canOpenDispute: false,
      disputeDeadline: null,
      activeDispute: null,
      serviceDispute: null,
      unavailableReason: "Only completed technician-performed inspections can be reviewed.",
    };
  }

  const assignedTechId = request.assigned_tech_id;
  if (!assignedTechId) {
    return {
      request,
      technicianProfileId: null,
      existingReview: null,
      canReview: false,
      canOpenDispute: false,
      disputeDeadline: null,
      activeDispute: null,
      serviceDispute: null,
      unavailableReason: "The technician profile is unavailable.",
    };
  }

  const [{ data: technicianProfile }, { data: existingReview }, { data: serviceDispute }, { data: completedSubmission }] = await Promise.all([
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
    admin
      .from("ppi_service_disputes")
      .select("id, reason_code, details, status, opened_at, outcome, resolution_note, review_action, resolved_at")
      .eq("ppi_request_id", request.id)
      .maybeSingle(),
    admin
      .from("ppi_submissions")
      .select("completed_at")
      .eq("ppi_request_id", request.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const completionTime = completedSubmission?.completed_at ?? request.updated_at;
  const disputeDeadline = new Date(new Date(completionTime).getTime() + 30 * 24 * 60 * 60 * 1000);
  const disputeWindowOpen = Number.isFinite(disputeDeadline.getTime()) && disputeDeadline > new Date();
  const activeDispute = serviceDispute?.status === "open" ? serviceDispute : null;
  const reviewUnderModeration = existingReview?.status === "hidden" && !existingReview.dispute_hold_id;
  const canReview = !!technicianProfile && !activeDispute && !reviewUnderModeration;

  return {
    request,
    technicianProfileId: technicianProfile?.id ?? null,
    existingReview: (existingReview as TechnicianReview | null) ?? null,
    canReview,
    canOpenDispute: !!technicianProfile && disputeWindowOpen && !serviceDispute,
    disputeDeadline: disputeWindowOpen ? disputeDeadline.toISOString() : null,
    activeDispute: activeDispute ?? null,
    serviceDispute: serviceDispute ?? null,
    unavailableReason: activeDispute
      ? "Your review is paused while the inspection dispute is open."
      : reviewUnderModeration
        ? "This review cannot be edited while it is hidden by content moderation."
        : canReview ? null : "The technician profile is unavailable.",
  };
}

export async function getAdminTechnicianReviews(
  page = 1,
  perPage = 50,
  status?: "active" | "hidden" | "all",
) {
  const admin = createAdminClient();
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = admin
    .from("technician_reviews")
    .select(REVIEW_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data, count } = await query;
  return {
    reviews: (data ?? []) as TechnicianReview[],
    total: count ?? 0,
  };
}
