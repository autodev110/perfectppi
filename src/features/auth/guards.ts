import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { UserRole } from "@/types/enums";
import { getRoleHomePath } from "@/features/auth/routing";

// Where an authenticated session with an unusable profile row ends up. It sits
// outside every role-guarded layout on purpose — see resolveSession.
const ACCOUNT_UNAVAILABLE_PATH = "/account-unavailable";

type SessionState =
  | { status: "anonymous" }
  | { status: "unusable" }
  | {
      status: "ok";
      profile: NonNullable<Awaited<ReturnType<typeof getAuthProfile>>>;
    };

/**
 * Resolves the caller into one of three states, keeping "not signed in" apart
 * from "signed in but the profile row is missing or unreadable".
 *
 * Collapsing those two used to deadlock the app. The guards sent both to
 * /login; the middleware sends any authenticated request for /login on to
 * /dashboard; and /dashboard runs the same guard again — so a valid session
 * whose profile could not be read ping-ponged between the two forever instead
 * of surfacing anything. Any future RLS change that hides profiles, a deleted
 * row, or a database blip would re-enter that loop, so the distinction is made
 * here once rather than at each call site.
 */
async function resolveSession(): Promise<SessionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "anonymous" };

  // maybeSingle, not single: a missing row is a state to report, not an error
  // to conflate with an RLS or connectivity failure.
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !profile) return { status: "unusable" };

  return { status: "ok", profile };
}

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
    .maybeSingle();

  return profile;
}

// Require a specific role — redirect if unauthorized
export async function requireRole(allowedRoles: UserRole[]) {
  const session = await resolveSession();

  if (session.status === "anonymous") {
    redirect("/login");
  }

  if (session.status === "unusable") {
    redirect(ACCOUNT_UNAVAILABLE_PATH);
  }

  const { profile } = session;

  if (!allowedRoles.includes(profile.role)) {
    redirect(getRoleHomePath(profile.role));
  }

  return profile;
}

// Require the developer grant. Unlike requireRole this looks at is_developer
// rather than role, because a developer spends most of its time wearing another
// role — the grant is what persists across switches.
export async function requireDeveloper() {
  const session = await resolveSession();

  if (session.status === "anonymous") {
    redirect("/login");
  }

  if (session.status === "unusable") {
    redirect(ACCOUNT_UNAVAILABLE_PATH);
  }

  const { profile } = session;

  if (!profile.is_developer) {
    // An account left on the developer role without the grant has no home to
    // be sent to — getRoleHomePath would point straight back at /dev. The
    // database keeps the two in step (profiles_sync_developer_role), so this
    // only fires if that ever slips; bounce out of the loop rather than into it.
    if (getRoleHomePath(profile.role) === "/dev") {
      redirect(ACCOUNT_UNAVAILABLE_PATH);
    }

    redirect(getRoleHomePath(profile.role));
  }

  return profile;
}
