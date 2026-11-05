"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { authorizeUserLink, denyUserLink } from "./user-links";
import { PARTNER_SOURCE_SYSTEMS } from "./constants";

// ============================================================================
// The two buttons on the consent screen.
//
// Exports in a "use server" module are callable by anyone who can reach the
// app, so each one re-authenticates from the session cookie and re-runs the
// full eligibility check. The `state` in the form is a lookup key, not a
// capability: possessing it authorizes nothing on its own.
// ============================================================================

const partnerSchema = z.enum(PARTNER_SOURCE_SYSTEMS);
const stateSchema = z.string().min(16).max(256);

async function getSessionProfileId(): Promise<string | null> {
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

/** Only a known system becomes part of a redirect target. */
function linkPath(formData: FormData): string {
  const partner = partnerSchema.safeParse(formData.get("partner"));
  return `/link/${partner.success ? partner.data : "dealerspace"}`;
}

export async function approveAccountLink(formData: FormData) {
  const partner = linkPath(formData);
  const state = stateSchema.safeParse(formData.get("state"));
  if (!state.success) redirect(`${partner}/invalid`);

  const profileId = await getSessionProfileId();
  if (!profileId) redirect(`/login?redirect=${partner}/${state.data}`);

  const result = await authorizeUserLink(state.data, profileId);
  if ("error" in result) {
    redirect(`${partner}/${state.data}?error=${result.error}`);
  }

  // The destination is the callback registered on the connection — never a
  // value carried in this request.
  redirect(result.data.redirectUrl);
}

export async function declineAccountLink(formData: FormData) {
  const partner = linkPath(formData);
  const state = stateSchema.safeParse(formData.get("state"));
  if (!state.success) redirect(`${partner}/invalid`);

  const profileId = await getSessionProfileId();
  if (!profileId) redirect(`/login?redirect=${partner}/${state.data}`);

  const result = await denyUserLink(state.data);
  if ("error" in result) {
    redirect(`${partner}/${state.data}?error=${result.error}`);
  }

  redirect(result.data.redirectUrl);
}
