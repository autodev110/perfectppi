import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRoleHomePath } from "@/features/auth/routing";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const requestedPath =
        next && next.startsWith("/") ? next : undefined;

      if (requestedPath) {
        return NextResponse.redirect(`${origin}${requestedPath}`);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("auth_user_id", user?.id ?? "")
        .single();

      return NextResponse.redirect(
        `${origin}${getRoleHomePath(profile?.role)}`
      );
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
