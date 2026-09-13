"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const reviewSchema = z.object({
  ppiRequestId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  title: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  content: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
});

function redirectWithError(ppiRequestId: string, error: string): never {
  redirect(`/dashboard/ppi/${ppiRequestId}/review?error=${encodeURIComponent(error)}`);
}

function reviewWriteError(message: string) {
  if (message.includes("review_blocked_by_active_dispute")) {
    return "The review is paused while your inspection dispute is open";
  }
  if (message.includes("review_edit_window_closed")) {
    return "The 30-day review editing window has closed";
  }
  if (message.includes("review_under_moderation")) {
    return "This review cannot be edited while it is hidden by content moderation";
  }
  if (message.includes("review_not_eligible") || message.includes("review_identity_is_immutable")) {
    return "This inspection is not eligible for that review update";
  }
  if (message.includes("duplicate key")) {
    return "A review already exists for this inspection";
  }
  console.warn("technician review write failed", { message: message.slice(0, 200) });
  return "The review could not be saved. Please try again";
}

async function getCurrentProfileId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return profile?.id ?? null;
}

export async function upsertTechnicianReview(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    ppiRequestId: formData.get("ppi_request_id"),
    rating: formData.get("rating"),
    title: formData.get("title") ?? undefined,
    content: formData.get("content") ?? undefined,
  });

  if (!parsed.success) {
    const fallbackId = String(formData.get("ppi_request_id") ?? "");
    const message = parsed.error.errors[0]?.message ?? "Invalid review form";
    if (fallbackId) redirectWithError(fallbackId, message);
    redirect("/dashboard/ppi");
  }

  const profileId = await getCurrentProfileId();
  if (!profileId) redirect("/login?redirect=/dashboard/ppi");

  const admin = createAdminClient();

  const { data: request } = await admin
    .from("ppi_requests")
    .select("id, requester_id, assigned_tech_id, status")
    .eq("id", parsed.data.ppiRequestId)
    .maybeSingle();

  if (!request) redirectWithError(parsed.data.ppiRequestId, "Inspection not found");

  if (request.requester_id !== profileId) {
    redirectWithError(parsed.data.ppiRequestId, "Only the inspection requester can leave a review");
  }

  if (request.status !== "completed") {
    redirectWithError(parsed.data.ppiRequestId, "Inspection must be completed before leaving a review");
  }

  if (!request.assigned_tech_id) {
    redirectWithError(parsed.data.ppiRequestId, "This inspection was not performed by a technician");
  }

  const { data: technicianProfile } = await admin
    .from("technician_profiles")
    .select("id")
    .eq("profile_id", request.assigned_tech_id)
    .maybeSingle();

  if (!technicianProfile) {
    redirectWithError(parsed.data.ppiRequestId, "Technician profile was not found");
  }

  const { data: existingReview } = await admin
    .from("technician_reviews")
    .select("id, reviewer_id")
    .eq("ppi_request_id", parsed.data.ppiRequestId)
    .maybeSingle();

  const { data: activeDispute } = await admin
    .from("ppi_service_disputes")
    .select("id")
    .eq("ppi_request_id", parsed.data.ppiRequestId)
    .eq("status", "open")
    .maybeSingle();

  if (activeDispute) {
    redirectWithError(parsed.data.ppiRequestId, "The review is paused while your inspection dispute is open");
  }

  if (existingReview && existingReview.reviewer_id !== profileId) {
    redirectWithError(parsed.data.ppiRequestId, "A review already exists for this inspection");
  }

  if (existingReview) {
    const { error } = await admin
      .from("technician_reviews")
      .update({
        rating: parsed.data.rating,
        title: parsed.data.title,
        content: parsed.data.content,
      })
      .eq("id", existingReview.id)
      .eq("reviewer_id", profileId);

    if (error) {
      redirectWithError(parsed.data.ppiRequestId, reviewWriteError(error.message));
    }
  } else {
    const { error } = await admin.from("technician_reviews").insert({
      technician_profile_id: technicianProfile.id,
      reviewer_id: profileId,
      ppi_request_id: parsed.data.ppiRequestId,
      rating: parsed.data.rating,
      title: parsed.data.title,
      content: parsed.data.content,
      status: "active",
    });

    if (error) {
      redirectWithError(parsed.data.ppiRequestId, reviewWriteError(error.message));
    }
  }

  revalidatePath(`/dashboard/ppi/${parsed.data.ppiRequestId}`);
  revalidatePath(`/dashboard/ppi/${parsed.data.ppiRequestId}/review`);
  revalidatePath("/tech/reviews");
  revalidatePath(`/technicians/${technicianProfile.id}`);
  revalidatePath(`/technicians/${technicianProfile.id}/reviews`);

  redirect(`/dashboard/ppi/${parsed.data.ppiRequestId}`);
}

export async function upsertTechnicianReviewFromInput(input: unknown) {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid review payload" };
  }

  const profileId = await getCurrentProfileId();
  if (!profileId) return { error: "Not authenticated" };

  const admin = createAdminClient();

  const { data: request } = await admin
    .from("ppi_requests")
    .select("id, requester_id, assigned_tech_id, status")
    .eq("id", parsed.data.ppiRequestId)
    .maybeSingle();

  if (!request) return { error: "Inspection not found" };

  if (request.requester_id !== profileId) {
    return { error: "Only the inspection requester can leave a review" };
  }

  if (request.status !== "completed") {
    return { error: "Inspection must be completed before leaving a review" };
  }

  if (!request.assigned_tech_id) {
    return { error: "This inspection was not performed by a technician" };
  }

  const { data: technicianProfile } = await admin
    .from("technician_profiles")
    .select("id")
    .eq("profile_id", request.assigned_tech_id)
    .maybeSingle();

  if (!technicianProfile) {
    return { error: "Technician profile was not found" };
  }

  const { data: existingReview } = await admin
    .from("technician_reviews")
    .select("id, reviewer_id")
    .eq("ppi_request_id", parsed.data.ppiRequestId)
    .maybeSingle();

  const { data: activeDispute } = await admin
    .from("ppi_service_disputes")
    .select("id")
    .eq("ppi_request_id", parsed.data.ppiRequestId)
    .eq("status", "open")
    .maybeSingle();

  if (activeDispute) {
    return { error: "The review is paused while your inspection dispute is open", code: "active_dispute" };
  }

  if (existingReview && existingReview.reviewer_id !== profileId) {
    return { error: "A review already exists for this inspection" };
  }

  if (existingReview) {
    const { data, error } = await admin
      .from("technician_reviews")
      .update({
        rating: parsed.data.rating,
        title: parsed.data.title,
        content: parsed.data.content,
      })
      .eq("id", existingReview.id)
      .eq("reviewer_id", profileId)
      .select("id")
      .single();

    if (error || !data) return { error: error ? reviewWriteError(error.message) : "The review could not be updated. Please try again" };
    revalidatePath(`/dashboard/ppi/${parsed.data.ppiRequestId}`);
    revalidatePath(`/dashboard/ppi/${parsed.data.ppiRequestId}/review`);
    revalidatePath("/tech/reviews");
    revalidatePath(`/technicians/${technicianProfile.id}`);
    revalidatePath(`/technicians/${technicianProfile.id}/reviews`);
    return { data };
  }

  const { data, error } = await admin
    .from("technician_reviews")
    .insert({
      technician_profile_id: technicianProfile.id,
      reviewer_id: profileId,
      ppi_request_id: parsed.data.ppiRequestId,
      rating: parsed.data.rating,
      title: parsed.data.title,
      content: parsed.data.content,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data) return { error: error ? reviewWriteError(error.message) : "The review could not be created. Please try again" };

  revalidatePath(`/dashboard/ppi/${parsed.data.ppiRequestId}`);
  revalidatePath(`/dashboard/ppi/${parsed.data.ppiRequestId}/review`);
  revalidatePath("/tech/reviews");
  revalidatePath(`/technicians/${technicianProfile.id}`);
  revalidatePath(`/technicians/${technicianProfile.id}/reviews`);

  return { data };
}
