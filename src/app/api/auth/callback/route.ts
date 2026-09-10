import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const requestedPath =
        next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;

      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("username_state")
        .eq("auth_user_id", user?.id ?? "")
        .maybeSingle();
      if (profile?.username_state !== "claimed") {
        const destination = new URL("/onboarding/username", origin);
        if (requestedPath) destination.searchParams.set("next", requestedPath);
        return NextResponse.redirect(destination);
      }

      if (requestedPath) {
        return NextResponse.redirect(`${origin}${requestedPath}`);
      }

      return NextResponse.redirect(`${origin}/legal/accept`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
