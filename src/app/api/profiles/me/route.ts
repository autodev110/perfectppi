import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

const updateSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  avatar_url: z.string().url().optional().or(z.literal("")),
  is_public: z.boolean().optional(),
  default_post_audience: z.enum(["public", "friends"]).optional(),
  discoverable: z.boolean().optional(),
  allow_exact_username_lookup: z.boolean().optional(),
  friend_request_policy: z.enum(["everyone", "friends_of_friends", "nobody"]).optional(),
});

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("username_state, is_public, default_post_audience, discoverable, allow_exact_username_lookup, friend_request_policy")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!currentProfile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  if (currentProfile.username_state !== "claimed") {
    return NextResponse.json(
      { error: "Choose a username before continuing", code: "username_required" },
      { status: 428 },
    );
  }

  const {
    is_public,
    default_post_audience,
    discoverable,
    allow_exact_username_lookup,
    friend_request_policy,
    ...profileUpdates
  } = parsed.data;

  // An audience-only PATCH from the app carries no plain profile fields; an
  // empty PostgREST update is not a no-op we want to rely on.
  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await supabase
      .from("profiles")
      .update(profileUpdates)
      .eq("auth_user_id", user.id)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const touchesPrivacy = is_public !== undefined
    || default_post_audience !== undefined
    || discoverable !== undefined
    || allow_exact_username_lookup !== undefined
    || friend_request_policy !== undefined;

  if (touchesPrivacy) {
    const nextPublic = is_public ?? currentProfile.is_public;
    const { error: privacyError } = await supabase.rpc("set_own_social_privacy", {
      p_is_public: nextPublic,
      p_default_post_audience: nextPublic
        ? (default_post_audience ?? currentProfile.default_post_audience)
        : "friends",
      p_discoverable: discoverable ?? currentProfile.discoverable,
      p_allow_exact_username_lookup:
        allow_exact_username_lookup ?? currentProfile.allow_exact_username_lookup,
      p_friend_request_policy: friend_request_policy ?? null,
    });
    if (privacyError) {
      return NextResponse.json({ error: "Privacy settings could not be updated" }, { status: 500 });
    }
  }

  const { data, error: reloadError } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();
  if (reloadError) {
    return NextResponse.json({ error: reloadError.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
