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
  const words = parseIpv6Words(normalized);

  if (!words) return false;

  const [a, b, c, d, e, f] = words;

  // Reject all mapped/compatible literals, including hexadecimal forms such as
  // ::ffff:a9fe:a9fe. Allowing public mapped addresses is not worth leaving a
  // second syntax through which private IPv4 destinations can be disguised.
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0) {
    if (f === 0 || f === 0xffff) return false;
  }

  if ((a & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((a & 0xff00) === 0xff00) return false; // ff00::/8 multicast

  // Special-use prefixes that can tunnel an IPv4 target or are not globally
  // routable callback destinations.
  if (a === 0x0064 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0) {
    return false; // 64:ff9b::/96 NAT64
  }
  if (a === 0x0064 && b === 0xff9b && c === 1) return false; // 64:ff9b:1::/48
  if (a === 0x0100 && b === 0 && c === 0 && d === 0) return false; // 100::/64 discard
  if (a === 0x2001 && (b & 0xfe00) === 0) return false; // 2001::/23 protocols
  if (a === 0x2001 && b === 0x0db8) return false; // documentation
  if (a === 0x2002) return false; // 6to4 can encapsulate private IPv4
  if (a === 0x3fff && (b & 0xf000) === 0) return false; // documentation

  return true;
}

function parseIpv6Words(address: string): number[] | null {
  if (address.includes("%")) return null;

  let value = address;
  if (value.includes(".")) {
    const separator = value.lastIndexOf(":");
    if (separator < 0) return null;
    const ipv4 = value.slice(separator + 1).split(".").map(Number);
    if (
      ipv4.length !== 4 ||
      ipv4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
      return null;
    }
    value = `${value.slice(0, separator)}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;

  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    return null;
  }

  const rawWords = [...left, ...Array(missing).fill("0"), ...right];
  if (rawWords.length !== 8 || rawWords.some((word) => !/^[0-9a-f]{1,4}$/i.test(word))) {
    return null;
  }

  return rawWords.map((word) => parseInt(word, 16));
}
