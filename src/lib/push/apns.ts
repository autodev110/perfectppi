import { createSign, createPrivateKey } from "crypto";

/**
 * APNs push dispatcher — token-based auth, HTTP/2 via fetch.
 *
 * Required env:
 *   APNS_AUTH_KEY        # Multiline PEM (begin with -----BEGIN PRIVATE KEY-----)
 *   APNS_KEY_ID          # 10-char key ID from Apple developer portal
 *   APNS_TEAM_ID         # 10-char Apple team ID
 *   APNS_TOPIC           # Bundle ID (e.g. com.perfectppi.app)
 *   APNS_ENV             # "prod" | "sandbox" (default "prod")
 *
 * Apple rotates the JWT signing window every ~55 minutes; we cache the JWT
 * for 50 minutes and re-sign on miss.
 */

export interface ApnsPayload {
  title: string;
  body: string;
  /** Custom data passed in the aps payload — used for deep linking. */
  data?: Record<string, unknown>;
  /** Optional thread / category / badge. */
  badge?: number;
  sound?: string;
  threadId?: string;
  category?: string;
}

export interface ApnsSendResult {
  token: string;
  ok: boolean;
  status: number;
  reason?: string;
}

export function isApnsConfigured(): boolean {
  return Boolean(
    process.env.APNS_AUTH_KEY &&
      process.env.APNS_KEY_ID &&
      process.env.APNS_TEAM_ID &&
      process.env.APNS_TOPIC,
  );
}

let cachedJwt: { token: string; issuedAt: number } | null = null;

function signApnsJwt(): string {
  // Reuse a JWT for up to 50 minutes per Apple's recommendation.
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < 50 * 60) {
    return cachedJwt.token;
  }

  const keyId = process.env.APNS_KEY_ID!;
  const teamId = process.env.APNS_TEAM_ID!;
  const pem = process.env.APNS_AUTH_KEY!.replace(/\\n/g, "\n");

  const header = { alg: "ES256", kid: keyId };
  const claims = { iss: teamId, iat: now };
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(claims)}`;

  const signer = createSign("SHA256");
  signer.update(unsigned);
  signer.end();
  const privateKey = createPrivateKey(pem);
  const signature = signer.sign(privateKey).toString("base64url");

  const jwt = `${unsigned}.${signature}`;
  cachedJwt = { token: jwt, issuedAt: now };
  return jwt;
}

function endpointFor(env: "prod" | "sandbox"): string {
  return env === "sandbox"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
}

function buildPayload(payload: ApnsPayload): string {
  const aps: Record<string, unknown> = {
    alert: { title: payload.title, body: payload.body },
    sound: payload.sound ?? "default",
  };
  if (typeof payload.badge === "number") aps.badge = payload.badge;
  if (payload.threadId) aps["thread-id"] = payload.threadId;
  if (payload.category) aps.category = payload.category;
  return JSON.stringify({ aps, ...(payload.data ?? {}) });
}

/**
 * Send a single push. Callers should usually use `pushToProfile` instead,
 * which fans out to all of a user's registered devices.
 */
export async function sendApnsPush(params: {
  deviceToken: string;
  env: "prod" | "sandbox";
  payload: ApnsPayload;
}): Promise<ApnsSendResult> {
  if (!isApnsConfigured()) {
    return {
      token: params.deviceToken,
      ok: false,
      status: 0,
      reason: "APNS_NOT_CONFIGURED",
    };
  }

  const jwt = signApnsJwt();
  const url = `${endpointFor(params.env)}/3/device/${params.deviceToken}`;
  const body = buildPayload(params.payload);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": process.env.APNS_TOPIC!,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body,
    });

    if (res.ok) {
      return { token: params.deviceToken, ok: true, status: res.status };
    }

    const text = await res.text();
    let reason = text;
    try {
      const parsed = JSON.parse(text);
      reason = parsed?.reason ?? text;
    } catch {}
    return {
      token: params.deviceToken,
      ok: false,
      status: res.status,
      reason,
    };
  } catch (err) {
    return {
      token: params.deviceToken,
      ok: false,
      status: 0,
      reason: err instanceof Error ? err.message : "fetch_failed",
    };
  }
}
