import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/",
  "/marketplace",
  "/community",
  "/vehicle",
  "/technicians",
  "/profile",
  "/share",
  "/callback",
  "/privacy",
  "/terms",
  "/privacy-choices",
  "/notice-at-collection",
  "/community-guidelines",
  "/ai-disclosure",
  "/accessibility",
  "/copyright",
  "/warranty-disclosure",
  "/support",
  "/sitemap.xml",
  "/robots.txt",
];
const AUTH_ROUTES = ["/login", "/signup"];

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

const USERNAME_PENDING_ROUTES = [
  "/onboarding/username",
  "/account-unavailable",
  "/callback",
  "/legal/accept",
  "/terms",
  "/privacy",
  "/privacy-choices",
  "/notice-at-collection",
  "/community-guidelines",
  "/ai-disclosure",
  "/accessibility",
  "/copyright",
  "/warranty-disclosure",
  "/support",
  "/api/auth",
  "/api/profiles/me",
  "/api/profiles/username",
  "/api/legal/accept",
  "/api/privacy",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Apple must fetch this file anonymously and without redirects.
  if (pathname === "/.well-known/apple-app-site-association") {
    return NextResponse.next();
  }

  const { supabaseResponse, user, supabase } = await updateSession(request);

  // Pending OAuth accounts may only finish identity/legal setup or exercise
  // privacy rights. Gate public-looking product pages too; otherwise a signed-in
  // pending account could browse them as if it were an anonymous visitor.
  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("username_state")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    const pendingRouteAllowed = USERNAME_PENDING_ROUTES.some((route) =>
      matchesRoute(pathname, route)
    );

    if ((profileError || !profile) && !pendingRouteAllowed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Account profile is temporarily unavailable", code: "profile_unavailable" },
          { status: 503 },
        );
      }
      return NextResponse.redirect(new URL("/account-unavailable", request.url));
    }

    if (profile?.username_state !== "claimed" && !pendingRouteAllowed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Choose a username before continuing", code: "username_required" },
          { status: 428 },
        );
      }

      const destination = new URL("/onboarding/username", request.url);
      destination.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(destination);
    }
  }

  // Public routes — always accessible
  if (
    PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))
  ) {
    return supabaseResponse;
  }

  // API routes — let them handle their own auth
  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  // Auth routes — redirect to dashboard if already logged in
  if (AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    if (user) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return supabaseResponse;
  }

  // Protected routes — redirect to login if not authenticated
  if (!user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Role-based portal access
  // We check the user's role via a custom claim in the JWT
  // For now, we allow access and let the layout/page handle role verification
  // since reading the profile requires a DB call which is better in the layout
  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
