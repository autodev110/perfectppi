import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AppleSignInError,
  encryptAppleToken,
  exchangeAppleAuthorizationCode,
  readAppleSignInConfig,
  revokeAppleRefreshToken,
} from "@/lib/auth/apple";

// Called by the iOS app right after a native Sign in with Apple. Exchanges
// the single-use authorization code for a refresh token and stores it
// encrypted so account deletion can revoke it (plan 8.2 / 36.1). Deliberately
// not gated on a claimed username: it runs before the username screen, and
// /api/auth is on the pending-account allowlist.

const bodySchema = z.object({
  authorizationCode: z.string().min(10).max(4096),
});

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401, headers: NO_STORE });

  const config = readAppleSignInConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Sign in with Apple token custody is not configured", code: "not_configured" },
      { status: 503, headers: NO_STORE },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: NO_STORE });

  // The code must belong to the Apple identity Supabase just attached to
  // this user; otherwise a caller could store someone else's token here.
  const appleIdentity = user.identities?.find((identity) => identity.provider === "apple");
  const expectedAppleUserId = typeof appleIdentity?.identity_data?.sub === "string"
    ? appleIdentity.identity_data.sub
    : appleIdentity?.id;
  if (!expectedAppleUserId) {
    return NextResponse.json({ error: "No Apple identity on this account" }, { status: 409, headers: NO_STORE });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404, headers: NO_STORE });

  try {
    const exchange = await exchangeAppleAuthorizationCode(parsed.data.authorizationCode, config);
    if (exchange.appleUserId !== expectedAppleUserId) {
      // The code is spent and Apple issued a token we will not keep; revoke
      // it so nothing usable is left behind by a mismatched submission.
      await revokeAppleRefreshToken(exchange.refreshToken, config).catch(() => undefined);
      throw new AppleSignInError("Authorization code belongs to a different Apple account", "identity_mismatch");
    }
    const { error } = await admin.from("apple_sign_in_tokens").upsert({
      profile_id: profile.id,
      apple_user_id: exchange.appleUserId,
      refresh_token_ciphertext: encryptAppleToken(exchange.refreshToken),
      updated_at: new Date().toISOString(),
      revoke_attempted_at: null,
      revoke_outcome: null,
      last_error: null,
    }, { onConflict: "profile_id" });
    if (error) throw new Error(error.message);
    return NextResponse.json({ linked: true }, { headers: NO_STORE });
  } catch (error) {
    const code = error instanceof AppleSignInError ? error.code : "exchange_failed";
    console.error("[auth/apple/link] failed", { code, message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json(
      { error: "Apple sign-in could not be linked for account deletion", code },
      { status: code === "identity_mismatch" ? 409 : 502, headers: NO_STORE },
    );
  }
}
