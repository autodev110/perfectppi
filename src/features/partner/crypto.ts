import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

// ============================================================================
// Credential material for the partner integration.
//
// Three different secrets with three different storage rules:
//
//   installation code   one-time, human-typed  -> only sha256 is stored
//   connection token    long-lived bearer      -> only sha256 is stored
//   webhook secret      we must sign with it   -> AES-256-GCM at rest
//
// Nothing in this module may be imported from a client component.
// ============================================================================

const ENCRYPTION_KEY_ENV = "PARTNER_SECRET_ENCRYPTION_KEY";
const ENVELOPE_VERSION = "v1";
const SIGNATURE_VERSION = "v1";

// Crockford-style alphabet: no I, L, O or U, so a code read aloud or copied by
// hand cannot be mistyped into a different valid code.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// --- Hashing / comparison ----------------------------------------------------

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Constant-time comparison of two hex digests.
 *
 * Both operands are validated as well-formed, non-empty hex first. Buffer.from
 * silently drops invalid hex characters, so without that check two pieces of
 * junk of equal length would decode to two empty buffers and compare *equal* —
 * a comparison helper must never answer "yes" to garbage.
 *
 * The shape check is not constant-time, but it only reveals whether the input
 * was hex at all, never anything about the secret. Length is compared before
 * timingSafeEqual because that function throws on a mismatch; both operands
 * here are fixed-width digests, so the length carries no information.
 */
const HEX_DIGEST = /^[0-9a-fA-F]+$/;

export function secureCompareHex(a: string, b: string): boolean {
  if (a.length === 0 || a.length !== b.length || a.length % 2 !== 0) return false;
  if (!HEX_DIGEST.test(a) || !HEX_DIGEST.test(b)) return false;

  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

// --- Installation codes ------------------------------------------------------

export interface GeneratedInstallationCode {
  code: string;
  codeHash: string;
  codePrefix: string;
}

/**
 * Produces `PPI-XXXXX-XXXXX-XXXXX-XXXXX` — 20 alphabet characters, i.e. 100
 * bits of entropy, grouped so a human can read it off one screen and type it
 * into another.
 */
export function generateInstallationCode(): GeneratedInstallationCode {
  const groups: string[] = [];
  for (let group = 0; group < 4; group++) {
    let chunk = "";
    // Rejection sampling keeps the distribution uniform over the 32-character
    // alphabet instead of biasing toward the low bytes with a modulo.
    while (chunk.length < 5) {
      for (const byte of randomBytes(16)) {
        if (byte >= 256 - (256 % CODE_ALPHABET.length)) continue;
        chunk += CODE_ALPHABET[byte % CODE_ALPHABET.length];
        if (chunk.length === 5) break;
      }
    }
    groups.push(chunk);
  }

  const code = `PPI-${groups.join("-")}`;
  return { code, codeHash: sha256Hex(code), codePrefix: `PPI-${groups[0]}` };
}

/** Accepts the code however the administrator pasted it (case, spaces, dashes). */
export function normalizeInstallationCode(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = cleaned.startsWith("PPI") ? cleaned.slice(3) : cleaned;
  if (body.length !== 20) return "";
  const groups = body.match(/.{5}/g) ?? [];
  return `PPI-${groups.join("-")}`;
}

// --- Connection tokens -------------------------------------------------------

export interface GeneratedConnectionToken {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
  tokenLastFour: string;
}

/**
 * `ppi_<16 hex prefix>_<43 char secret>`. The prefix is a non-secret index key:
 * it narrows the lookup to one row so the hash comparison that follows is a
 * single constant-time check rather than a scan.
 */
export function generateConnectionToken(): GeneratedConnectionToken {
  const prefix = randomBytes(8).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const token = `ppi_${prefix}_${secret}`;

  return {
    token,
    tokenHash: sha256Hex(token),
    tokenPrefix: prefix,
    tokenLastFour: secret.slice(-4),
  };
}

export function parseConnectionToken(token: string): { prefix: string } | null {
  const match = /^ppi_([0-9a-f]{16})_([A-Za-z0-9_-]{43})$/.exec(token);
  return match ? { prefix: match[1] } : null;
}

// --- Webhook secrets ---------------------------------------------------------

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function generateOpaqueHandle(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// --- Encryption at rest ------------------------------------------------------

function getEncryptionKey(): Buffer {
  const raw = process.env[ENCRYPTION_KEY_ENV];
  if (!raw) {
    throw new Error(
      `${ENCRYPTION_KEY_ENV} is not set. Generate one with: openssl rand -base64 32`,
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`${ENCRYPTION_KEY_ENV} must decode to exactly 32 bytes (AES-256)`);
  }
  return key;
}

export function isPartnerEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

/** Returns `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptSecret(envelope: string): string {
  const [version, ivPart, tagPart, ciphertextPart] = envelope.split(".");
  if (version !== ENVELOPE_VERSION || !ivPart || !tagPart || !ciphertextPart) {
    throw new Error("Unrecognized secret envelope format");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

// --- Outbound webhook signatures ---------------------------------------------

/**
 * Signs the exact bytes we transmit: `timestamp + "." + rawBody`. DealerSpace
 * must verify against its own raw body — re-serializing parsed JSON will not
 * reproduce this digest, which is the point.
 */
export function signWebhookPayload(params: {
  secret: string;
  timestamp: string;
  rawBody: string;
}): string {
  const signature = createHmac("sha256", params.secret)
    .update(`${params.timestamp}.${params.rawBody}`)
    .digest("hex");

  return `${SIGNATURE_VERSION}=${signature}`;
}

// --- Payload fingerprints ----------------------------------------------------

/**
 * Stable digest of a create payload, used to tell an honest retry apart from a
 * reused idempotency key carrying different data. Object keys are sorted so an
 * ordering difference between two JSON encoders is not read as a conflict.
 */
export function fingerprintPayload(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}
