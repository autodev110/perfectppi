import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { UserRole } from "@/types/enums";
import { getRoleHomePath } from "@/features/auth/routing";

// Server-side auth guard for use in Server Components and Route Handlers
export async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

// Get the current user's profile (with role)
export async function getAuthProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  return profile;
}

// Require a specific role — redirect if unauthorized
export async function requireRole(allowedRoles: UserRole[]) {
  const profile = await getAuthProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!allowedRoles.includes(profile.role)) {
    redirect(getRoleHomePath(profile.role));
  }

  return profile;
}
