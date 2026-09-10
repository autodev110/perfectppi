import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { describe, test } from "node:test";

const {
  createAppleClientSecret,
  decodeJwtPayload,
  decryptAppleToken,
  encryptAppleToken,
  exchangeAppleAuthorizationCode,
  readAppleSignInConfig,
  revokeAppleRefreshToken,
  AppleSignInError,
} = await import("../../src/lib/auth/apple.ts");

// A throwaway P-256 key, the same curve Apple issues .p8 keys on.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const config = { teamId: "TEAM123456", keyId: "KEY1234567", privateKeyPem: pem, clientId: "com.perfectppi.app" };

function jwtHeader(token: string) {
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
}

function fakeIdToken(claims: Record<string, unknown>) {
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(claims)}.sig`;
}

describe("Sign in with Apple: configuration", () => {
  test("reads the config only when every Apple credential is present and unescapes the key", () => {
    assert.equal(readAppleSignInConfig({}), null);
    assert.equal(readAppleSignInConfig({ APPLE_SIGN_IN_TEAM_ID: "T", APPLE_SIGN_IN_KEY_ID: "K" }), null);
    const read = readAppleSignInConfig({
      APPLE_SIGN_IN_TEAM_ID: "T", APPLE_SIGN_IN_KEY_ID: "K", APPLE_SIGN_IN_PRIVATE_KEY: "-----BEGIN\\nabc\\n-----END",
    });
    assert.equal(read?.privateKeyPem, "-----BEGIN\nabc\n-----END");
    assert.equal(read?.clientId, "com.perfectppi.app");
  });
});

describe("Sign in with Apple: client secret", () => {
  test("is an ES256 JWT Apple can verify, scoped to the app and short-lived", () => {
    const now = Date.parse("2026-09-10T12:00:00Z");
    const token = createAppleClientSecret(config, now);
    const [header, payload, signature] = token.split(".");
    assert.deepEqual(jwtHeader(token), { alg: "ES256", kid: "KEY1234567", typ: "JWT" });
    const claims = decodeJwtPayload(token);
    assert.equal(claims?.iss, "TEAM123456");
    assert.equal(claims?.sub, "com.perfectppi.app");
    assert.equal(claims?.aud, "https://appleid.apple.com");
    assert.equal(claims?.iat, Math.floor(now / 1000));
    assert.equal(Number(claims?.exp) - Number(claims?.iat), 600);
    const ok = verify("sha256", Buffer.from(`${header}.${payload}`), {
      key: publicKey, dsaEncoding: "ieee-p1363",
    }, Buffer.from(signature, "base64url"));
    assert.equal(ok, true, "signature must verify with the public key");
  });
});

describe("Sign in with Apple: code exchange", () => {
  test("returns the refresh token and Apple user id for a matching id_token", async () => {
    let seen: { url: string; body: URLSearchParams } | null = null;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), body: init?.body as URLSearchParams };
      return new Response(JSON.stringify({
        refresh_token: "rt_secret",
        id_token: fakeIdToken({ iss: "https://appleid.apple.com", aud: "com.perfectppi.app", sub: "001234.abcd" }),
      }), { status: 200 });
    }) as typeof fetch;
    const result = await exchangeAppleAuthorizationCode("c_once", config, fetchImpl);
    assert.deepEqual(result, { refreshToken: "rt_secret", appleUserId: "001234.abcd" });
    assert.equal(seen!.url, "https://appleid.apple.com/auth/token");
    assert.equal(seen!.body.get("grant_type"), "authorization_code");
    assert.equal(seen!.body.get("code"), "c_once");
    assert.equal(seen!.body.get("client_id"), "com.perfectppi.app");
    assert.ok(seen!.body.get("client_secret")?.split(".").length === 3);
  });

  test("rejects an id_token for another app or issuer, and Apple errors", async () => {
    const wrongAud = (async () => new Response(JSON.stringify({
      refresh_token: "rt", id_token: fakeIdToken({ iss: "https://appleid.apple.com", aud: "com.other.app", sub: "x" }),
    }), { status: 200 })) as typeof fetch;
    await assert.rejects(() => exchangeAppleAuthorizationCode("c", config, wrongAud), (error: unknown) =>
      error instanceof AppleSignInError && error.code === "exchange_failed");
    const denied = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as typeof fetch;
    await assert.rejects(() => exchangeAppleAuthorizationCode("c", config, denied), /invalid_grant/);
  });
});

describe("Sign in with Apple: revocation", () => {
  test("treats success and already-invalid tokens as done, anything else as retryable", async () => {
    const ok = (async () => new Response("", { status: 200 })) as typeof fetch;
    assert.equal(await revokeAppleRefreshToken("rt", config, ok), "revoked");
    const gone = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as typeof fetch;
    assert.equal(await revokeAppleRefreshToken("rt", config, gone), "already_invalid");
    const outage = (async () => new Response("", { status: 503 })) as typeof fetch;
    await assert.rejects(() => revokeAppleRefreshToken("rt", config, outage), (error: unknown) =>
      error instanceof AppleSignInError && error.code === "revoke_failed");
  });
});

describe("Sign in with Apple: token custody", () => {
  test("encrypts with a dedicated key and round-trips; a different key cannot decrypt", () => {
    const keyA = { APPLE_TOKEN_ENCRYPTION_KEY: "a".repeat(64) };
    const keyB = { APPLE_TOKEN_ENCRYPTION_KEY: "b".repeat(64) };
    const sealed = encryptAppleToken("rt_secret_value", keyA);
    assert.ok(sealed.startsWith("v1."));
    assert.ok(!sealed.includes("rt_secret_value"));
    assert.equal(decryptAppleToken(sealed, keyA), "rt_secret_value");
    assert.throws(() => decryptAppleToken(sealed, keyB));
    // Fresh IV per call: two seals of the same token differ.
    assert.notEqual(encryptAppleToken("rt_secret_value", keyA), sealed);
  });

  test("falls back to a key derived from the service-role secret and rejects malformed keys", () => {
    const derived = { SUPABASE_SERVICE_ROLE_KEY: "service-role-secret" };
    assert.equal(decryptAppleToken(encryptAppleToken("x", derived), derived), "x");
    assert.throws(() => encryptAppleToken("x", { APPLE_TOKEN_ENCRYPTION_KEY: "tooshort" }), /32 bytes/);
    assert.throws(() => encryptAppleToken("x", {}), /No key/);
  });
});
