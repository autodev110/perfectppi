import { createClient } from "@/lib/supabase/server";
import type { PpiRequestStatus } from "@/types/enums";

// ============================================================================
// Phase A count queries (kept for dashboard stats)
// ============================================================================

export async function getMyPpiRequestCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!profile) return 0;

  const { count } = await supabase
    .from("ppi_requests")
    .select("*", { count: "exact", head: true })
    .eq("requester_id", profile.id);

  return count ?? 0;
}

export async function getMyTechQueueCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  if (!profileRow) return 0;

  const { count } = await supabase
    .from("ppi_requests")
    .select("*", { count: "exact", head: true })
    .eq("assigned_tech_id", profileRow.id)
    .not("status", "in", '("completed","archived")');

  return count ?? 0;
}

// ============================================================================
// Phase B queries
// ============================================================================

async function getMyProfileId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();
  return profile?.id ?? null;
}

export async function getMyPpiRequests(filters?: { status?: PpiRequestStatus }) {
  const supabase = await createClient();
  const profileId = await getMyProfileId();
  if (!profileId) return [];

  let query = supabase
    .from("ppi_requests")
    .select(
      `
      *,
      vehicle:vehicles(id, year, make, model, trim, vin, mileage),
      assigned_tech:profiles!ppi_requests_assigned_tech_id_fkey(id, display_name, avatar_url, username)
    `
    )
    .eq("requester_id", profileId)
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data } = await query;
  return data ?? [];
}

export async function getPpiRequest(id: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("ppi_requests")
    .select(
      `
      *,
      vehicle:vehicles(id, year, make, model, trim, vin, mileage),
      requester:profiles!ppi_requests_requester_id_fkey(id, display_name, avatar_url, username),
      assigned_tech:profiles!ppi_requests_assigned_tech_id_fkey(id, display_name, avatar_url, username)
    `
    )
    .eq("id", id)
    .single();

  return data;
}

export async function getCurrentSubmission(requestId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("ppi_submissions")
    .select(
      `
      *,
      sections:ppi_sections(
        *,
        answers:ppi_answers(*),
        media:ppi_media(*)
      )
    `
    )
    .eq("ppi_request_id", requestId)
    .eq("is_current", true)
    .single();

  if (!data) return null;

  // Sort sections and answers by sort_order
  const sorted = {
    ...data,
    sections: (data.sections ?? [])
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
      .map((s: { answers: { sort_order: number }[]; [key: string]: unknown }) => ({
        ...s,
        answers: [...(s.answers ?? [])].sort(
          (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
        ),
      })),
  };

  return sorted;
}

export async function getSubmission(submissionId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("ppi_submissions")
    .select(
      `
      *,
      sections:ppi_sections(
        *,
        answers:ppi_answers(*),
        media:ppi_media(*)
      )
    `
    )
    .eq("id", submissionId)
    .single();

  if (!data) return null;

  const sorted = {
    ...data,
    sections: (data.sections ?? [])
      .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
      .map((s: { answers: { sort_order: number }[]; [key: string]: unknown }) => ({
        ...s,
        answers: [...(s.answers ?? [])].sort(
          (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
        ),
      })),
  };

  return sorted;
}

export async function getTechQueue(filters?: { status?: PpiRequestStatus }) {
  const supabase = await createClient();
  const profileId = await getMyProfileId();
  if (!profileId) return [];

  let query = supabase
    .from("ppi_requests")
    .select(
      `
      *,
      vehicle:vehicles(id, year, make, model, trim),
      requester:profiles!ppi_requests_requester_id_fkey(id, display_name, avatar_url, username)
    `
    )
    .eq("assigned_tech_id", profileId)
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  } else {
    // Default: exclude completed/archived
    query = query.not("status", "in", '("completed","archived")');
  }

  const { data } = await query;
  return data ?? [];
}

export async function getTechRequestDetail(requestId: string) {
  const supabase = await createClient();
  const profileId = await getMyProfileId();
  if (!profileId) return null;

  const { data } = await supabase
    .from("ppi_requests")
    .select(
      `
      *,
      vehicle:vehicles(id, year, make, model, trim, vin, mileage),
      requester:profiles!ppi_requests_requester_id_fkey(id, display_name, avatar_url, username),
      assigned_tech:profiles!ppi_requests_assigned_tech_id_fkey(id, display_name, avatar_url, username)
    `
    )
    .eq("id", requestId)
    .eq("assigned_tech_id", profileId)
    .single();

  return data;
}

export async function getPpiSubmissionVersions(requestId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("ppi_submissions")
    .select("id, version, is_current, status, submitted_at, created_at")
    .eq("ppi_request_id", requestId)
    .order("version", { ascending: false });

  return data ?? [];
}
