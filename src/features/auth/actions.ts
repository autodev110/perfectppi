"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getRoleHomePath } from "@/features/auth/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordTermsAcceptance } from "@/lib/legal/server";
import { headers } from "next/headers";
import { CANONICAL_ORIGIN, TERMS_VERSION } from "@/lib/legal/constants";

const signUpSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1, "Name is required").max(100),
  acceptTerms: z.literal("on", {
    errorMap: () => ({ message: "You must agree to the Terms of Service" }),
  }),
});

const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function signUp(formData: FormData) {
  const raw = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    displayName: formData.get("displayName") as string,
    acceptTerms: formData.get("acceptTerms") as string,
  };

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const { data: signUpData, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.displayName,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (!signUpData.user) return { error: "Account creation did not return a user" };

  const { data: createdProfile, error: profileError } = await createAdminClient()
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", signUpData.user.id)
    .single();
  if (profileError || !createdProfile) {
    await createAdminClient().auth.admin.deleteUser(signUpData.user.id).catch(() => undefined);
    return { error: "Your account was created, but setup could not be completed. Contact support." };
  }

  try {
    await recordTermsAcceptance({
      profileId: createdProfile.id,
      source: "web_signup",
      headers: await headers(),
    });
  } catch {
    await createAdminClient().auth.admin.deleteUser(signUpData.user.id).catch(() => undefined);
    return { error: "Your account was created, but Terms acceptance could not be recorded. Contact support." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("auth_user_id", user?.id ?? "")
    .single();

  redirect(getRoleHomePath(profile?.role ?? createdProfile.role));
}

export async function signIn(formData: FormData) {
  const raw = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", data.user.id)
    .single();

  if (profile) {
    const { data: acceptance } = await supabase
      .from("legal_acceptances")
      .select("id")
      .eq("profile_id", profile.id)
      .eq("document_type", "terms")
      .eq("document_version", TERMS_VERSION)
      .maybeSingle();
    if (!acceptance) redirect("/legal/accept");
  }

  redirect(getRoleHomePath(profile?.role));
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? CANONICAL_ORIGIN}/callback?next=/legal/accept`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.url) {
    redirect(data.url);
  }
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
