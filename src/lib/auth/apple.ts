import { createCipheriv, createDecipheriv, createHash, createPrivateKey, randomBytes, sign } from "node:crypto";

// Sign in with Apple server support (plan 8.2 / 35 / 36.1).
//
// The app signs in natively with an Apple identity token via Supabase. This
// module handles what Supabase does not: exchanging the one-time
// authorization code for an Apple refresh token so the token can be revoked
// when the member deletes their account (App Store Review Guideline 5.1.1(v)).
// The refresh token is stored encrypted and never leaves the server.

const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const APPLE_ISSUER = "https://appleid.apple.com";

export type AppleSignInConfig = {
  teamId: string;
  keyId: string;
  privateKeyPem: string;
  clientId: string;
};

export function readAppleSignInConfig(env: NodeJS.ProcessEnv = process.env): AppleSignInConfig | null {
  const teamId = env.APPLE_SIGN_IN_TEAM_ID?.trim();
  const keyId = env.APPLE_SIGN_IN_KEY_ID?.trim();
  const privateKeyPem = env.APPLE_SIGN_IN_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const clientId = env.APPLE_SIGN_IN_CLIENT_ID?.trim() || "com.perfectppi.app";
  if (!teamId || !keyId || !privateKeyPem) return null;
  return { teamId, keyId, privateKeyPem, clientId };
}

export function isAppleSignInConfigured(env: NodeJS.ProcessEnv = process.env) {
  return readAppleSignInConfig(env) !== null;
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

/**
 * Apple client secret: an ES256 JWT signed with the Sign in with Apple key.
 * Apple caps validity at six months; we issue short-lived ones per call.
 */
export function createAppleClientSecret(config: AppleSignInConfig, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: config.teamId,
    iat: issuedAt,
    exp: issuedAt + 10 * 60,
    aud: APPLE_ISSUER,
    sub: config.clientId,
  }));
  const signingInput = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: createPrivateKey(config.privateKeyPem),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64url(signature)}`;
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const parsed = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export type AppleTokenExchange = {
  refreshToken: string;
  /** `sub` from Apple's id_token: the stable Apple user identifier. */
  appleUserId: string;
};

export type AppleSignInErrorCode = "not_configured" | "exchange_failed" | "identity_mismatch" | "revoke_failed";

export class AppleSignInError extends Error {
  readonly code: AppleSignInErrorCode;

  constructor(message: string, code: AppleSignInErrorCode) {
    super(message);
    this.code = code;
  }
}

/** Exchanges the native authorization code for a refresh token (Apple: valid for 5 minutes, single use). */
export async function exchangeAppleAuthorizationCode(
  code: string,
  config: AppleSignInConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<AppleTokenExchange> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: createAppleClientSecret(config),
    code,
    grant_type: "authorization_code",
  });
  const response = await fetchImpl(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await response.json().catch(() => null)) as
    | { refresh_token?: string; id_token?: string; error?: string }
    | null;
  if (!response.ok || !json?.refresh_token || !json.id_token) {
    throw new AppleSignInError(`Apple token exchange failed: ${json?.error ?? response.status}`, "exchange_failed");
  }
  const claims = decodeJwtPayload(json.id_token);
  const appleUserId = typeof claims?.sub === "string" ? claims.sub : null;
  if (!appleUserId || claims?.iss !== APPLE_ISSUER || claims?.aud !== config.clientId) {
    throw new AppleSignInError("Apple id_token did not identify a user for this app", "exchange_failed");
  }
  return { refreshToken: json.refresh_token, appleUserId };
}

export type AppleRevokeOutcome = "revoked" | "already_invalid";

/**
 * Revokes the stored refresh token. Apple answers 200 on success; an
 * invalid_grant/invalid_request means the token was already revoked or
 * expired, which is treated as done. Anything else is retryable.
 */
export async function revokeAppleRefreshToken(
  refreshToken: string,
  config: AppleSignInConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<AppleRevokeOutcome> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: createAppleClientSecret(config),
    token: refreshToken,
    token_type_hint: "refresh_token",
  });
  const response = await fetchImpl(APPLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (response.ok) return "revoked";
  const json = (await response.json().catch(() => null)) as { error?: string } | null;
  if (response.status === 400 && (json?.error === "invalid_grant" || json?.error === "invalid_request")) {
    return "already_invalid";
  }
  throw new AppleSignInError(`Apple token revocation failed: ${json?.error ?? response.status}`, "revoke_failed");
}

// ---------------------------------------------------------------------------
// At-rest protection for the refresh token: AES-256-GCM under a dedicated key,
// falling back to a key derived from the service-role secret.
// ---------------------------------------------------------------------------
function encryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const explicit = env.APPLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (explicit) {
    const raw = /^[0-9a-f]{64}$/i.test(explicit) ? Buffer.from(explicit, "hex") : Buffer.from(explicit, "base64");
    if (raw.length === 32) return raw;
    throw new Error("APPLE_TOKEN_ENCRYPTION_KEY must be 32 bytes (hex or base64)");
  }
  const fallback = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fallback) throw new Error("No key available to protect Apple tokens");
  return createHash("sha256").update(`${fallback}:apple-refresh-token`).digest();
}

export function encryptAppleToken(plaintext: string, env: NodeJS.ProcessEnv = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(env), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptAppleToken(sealed: string, env: NodeJS.ProcessEnv = process.env): string {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Unrecognized sealed token format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(env), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
