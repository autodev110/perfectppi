import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { usernameSchema } from "@/features/profiles/username";
import { recordProductEvent } from "@/features/analytics/product-events";
import { INVITE_COOKIE } from "@/lib/analytics/invite";

// Availability must work before an account exists (email signup), so this GET
// is anonymous. Enumeration is bounded per source address with the same
// fixed-window Postgres counter the partner API uses (plan section 31.2).
const AVAILABILITY_WINDOW_MS = 60_000;
const AVAILABILITY_MAX_PER_WINDOW = 30;

function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

async function availabilityRateLimited(request: Request) {
  const windowStart = new Date(
    Math.floor(Date.now() / AVAILABILITY_WINDOW_MS) * AVAILABILITY_WINDOW_MS,
  );
  const { data, error } = await createAdminClient().rpc("partner_rate_limit_hit", {
    p_bucket_key: `username-availability:${clientAddress(request)}`,
    p_window_start: windowStart.toISOString(),
  });
  if (error) {
    // Fail open: a counter outage must not block onboarding.
    console.error("username availability rate limit check failed", error.message);
    return null;
  }
  if ((data ?? 0) <= AVAILABILITY_MAX_PER_WINDOW) return null;
  const retryAfter = Math.max(
    1,
    Math.ceil((windowStart.getTime() + AVAILABILITY_WINDOW_MS - Date.now()) / 1000),
  );
  return NextResponse.json(
    { error: "Too many username checks. Please wait a moment.", code: "rate_limited" },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfter) } },
  );
}

export async function GET(request: Request) {
  const limited = await availabilityRateLimited(request);
  if (limited) return limited;

  const username = new URL(request.url).searchParams.get("username") ?? "";
  const parsed = usernameSchema.safeParse(username);
  if (!parsed.success) {
    return NextResponse.json({
      available: false,
      error: parsed.error.errors[0].message,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data, error } = await createAdminClient().rpc("is_username_available", {
    p_username: parsed.data,
  });
  if (error) {
    return NextResponse.json(
      { error: "Username availability is temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { available: data === true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = usernameSchema.safeParse(
    body && typeof body === "object" ? (body as { username?: unknown }).username : undefined,
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message, code: "validation" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("claim_own_username", {
    p_username: parsed.data,
  });
  if (error?.code === "23505") {
    return NextResponse.json(
      { error: "That username was just taken. Try another one.", code: "conflict" },
      { status: 409 },
    );
  }
  if (error) {
    return NextResponse.json(
      { error: "Your username could not be saved. Please try again." },
      { status: 500 },
    );
  }

  if (data?.id) {
    await recordProductEvent({
      profileId: data.id,
      eventName: "profile_completed",
      surface: "profile",
      dedupeId: data.id,
    });
    // Invite conversion (Renditions KPIs): counted once, then forgotten.
    const cookieStore = await cookies();
    if (cookieStore.get(INVITE_COOKIE)?.value === "1") {
      await recordProductEvent({ profileId: data.id, eventName: "signup_from_invite", surface: "profile", dedupeId: data.id });
      cookieStore.set(INVITE_COOKIE, "", { path: "/", maxAge: 0 });
    }
  }

  return NextResponse.json(data);
}
