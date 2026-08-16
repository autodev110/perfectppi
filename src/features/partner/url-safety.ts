import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// ============================================================================
// SSRF / open-redirect guard for partner-supplied destinations.
//
// DealerSpace registers a webhook URL and a user-link callback once, at
// connection time. Both are checked here — at registration *and* again
// immediately before every outbound request, because DNS can be re-pointed at
// an internal address after the connection was approved.
// ============================================================================

const ALLOW_INSECURE = () =>
  process.env.PARTNER_ALLOW_INSECURE_CALLBACKS === "true";

export type UrlRejectionReason =
  | "invalid_url"
  | "unsupported_scheme"
  | "credentials_in_url"
  | "unresolvable_host"
  | "private_address"
  | "too_long";

export interface UrlCheckResult {
  ok: boolean;
  reason?: UrlRejectionReason;
  detail?: string;
  url?: URL;
}

const MAX_URL_LENGTH = 2048;

/** Structural checks only — no DNS. Safe to call in a hot path. */
export function checkUrlShape(raw: string): UrlCheckResult {
  if (!raw || raw.length > MAX_URL_LENGTH) {
    return { ok: false, reason: "too_long" };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  const httpsOnly = !ALLOW_INSECURE();
  if (url.protocol !== "https:" && !(url.protocol === "http:" && !httpsOnly)) {
    return {
      ok: false,
      reason: "unsupported_scheme",
      detail: httpsOnly ? "https is required" : "only http/https are supported",
    };
  }

  // `https://attacker@internal/` parses with host=internal but reads as
  // attacker's host to a careless human reviewer.
  if (url.username || url.password) {
    return { ok: false, reason: "credentials_in_url" };
  }

  return { ok: true, url };
}

/** Full check: shape plus every address the hostname currently resolves to. */
export async function checkUrlIsSafeDestination(raw: string): Promise<UrlCheckResult> {
  const shape = checkUrlShape(raw);
  if (!shape.ok || !shape.url) return shape;

  const url = shape.url;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  if (ALLOW_INSECURE() && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return { ok: true, url };
  }

  let addresses: string[];
  if (isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      const resolved = await lookup(hostname, { all: true, verbatim: true });
      addresses = resolved.map((entry) => entry.address);
    } catch {
      return { ok: false, reason: "unresolvable_host", detail: hostname };
    }
  }

  if (addresses.length === 0) {
    return { ok: false, reason: "unresolvable_host", detail: hostname };
  }

  // Every address must be public: one private answer in a round-robin set is
  // enough for an attacker to eventually reach an internal service.
  const offender = addresses.find((address) => !isPublicAddress(address));
  if (offender) {
    return { ok: false, reason: "private_address", detail: offender };
  }

  return { ok: true, url };
}

export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }

  const [a, b] = parts;

  if (a === 0) return false; // "this" network
  if (a === 10) return false; // RFC1918
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // RFC1918
  if (a === 192 && b === 168) return false; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 192 && b === 0) return false; // IETF protocol assignments / TEST-NET-1
  if (a === 198 && b === 51) return false; // TEST-NET-2
  if (a === 203 && b === 0) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast

  return true;
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  if (normalized === "::" || normalized === "::1") return false;

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible forms are judged by the
  // embedded v4 address, otherwise ::ffff:169.254.169.254 slips through.
  const mapped = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) return isPublicIpv4(mapped[1]);

  const head = normalized.split(":")[0] ?? "";
  const leading = parseInt(head.padStart(4, "0").slice(0, 4), 16);
  if (Number.isNaN(leading)) return false;

  if ((leading & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((leading & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((leading & 0xff00) === 0xff00) return false; // ff00::/8 multicast

  return true;
}
