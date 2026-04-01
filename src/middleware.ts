import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/", "/technicians", "/profile", "/share", "/callback"];
const AUTH_ROUTES = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

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
