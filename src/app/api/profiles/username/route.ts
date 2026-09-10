import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { usernameSchema } from "@/features/profiles/username";

export async function GET(request: Request) {
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

  return NextResponse.json(data);
}
