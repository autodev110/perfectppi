import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/enums";

type ApiRoleResult =
  | {
      profile: {
        id: string;
        role: UserRole;
      };
      supabase: Awaited<ReturnType<typeof createClient>>;
    }
  | {
      response: NextResponse;
    };

export async function requireApiRole(
  allowedRoles: UserRole[]
): Promise<ApiRoleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      ),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) {
    return {
      response: NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      ),
    };
  }

  if (!allowedRoles.includes(profile.role)) {
    return {
      response: NextResponse.json({ error: "Not authorized" }, { status: 403 }),
    };
  }

  return { profile, supabase };
}
