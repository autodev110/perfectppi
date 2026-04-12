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
        status: "active",
      })
      .eq("id", existingReview.id)
      .eq("reviewer_id", profileId);

    if (error) {
      redirectWithError(parsed.data.ppiRequestId, error.message);
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
      redirectWithError(parsed.data.ppiRequestId, error.message);
    }
  }

  revalidatePath(`/dashboard/ppi/${parsed.data.ppiRequestId}`);
  revalidatePath(`/dashboard/ppi/${parsed.data.ppiRequestId}/review`);
  revalidatePath("/tech/reviews");
  revalidatePath(`/technicians/${technicianProfile.id}`);
  revalidatePath(`/technicians/${technicianProfile.id}/reviews`);

  redirect(`/dashboard/ppi/${parsed.data.ppiRequestId}`);
}
