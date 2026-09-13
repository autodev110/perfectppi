import { createHash } from "node:crypto";

// Deterministic launch-mode publication policy (plan section 21.1).
//
// In launch mode an ordinary text post or comment reaches `active` in the same
// request once it passes these checks. This is not an editorial approval
// queue: it rejects technically malicious or explicitly disallowed input and
// lets everything else publish immediately. Ambiguous profanity is not
// treated as a proven violation here.
//
// The policy is versioned. Bump LAUNCH_POLICY_VERSION whenever a rule changes
// so moderation records identify which rule set evaluated a piece of content.

export const LAUNCH_POLICY_VERSION = "perfectppi-launch-policy-v1";

// Stable user-facing outcome codes (plan 21.1). Clients map these to recovery
// copy; they never receive the private pattern or rule that matched.
export const PUBLICATION_OUTCOME_CODES = [
  "validation_failed",
  "unsafe_link",
  "duplicate_content",
  "rate_limited",
  "content_not_allowed",
  "invalid_media",
  "media_safety_unavailable",
  "posting_restricted",
  "unauthorized_audience",
  "posting_unavailable",
  "unsupported_media",
] as const;

export type PublicationOutcome = (typeof PUBLICATION_OUTCOME_CODES)[number];

export const PUBLICATION_OUTCOME_MESSAGES: Record<PublicationOutcome, string> = {
  validation_failed: "Please check your post and try again.",
  unsafe_link: "This post includes a link we cannot accept. Remove it or use a standard web address.",
  duplicate_content: "You just posted the same thing. Edit it or wait a couple of minutes.",
  rate_limited: "You are posting too quickly. Please wait a few minutes and try again.",
  content_not_allowed: "This content cannot be published because it does not follow the PerfectPPI Community Guidelines.",
  invalid_media: "One of the selected files could not be used. Try a different photo.",
  media_safety_unavailable: "Photo publishing is temporarily unavailable. You can still post text.",
  posting_restricted: "Community posting is unavailable for this account.",
  unauthorized_audience: "You cannot publish to that audience.",
  posting_unavailable: "Community posting is temporarily unavailable. Please try again later.",
  unsupported_media: "Video posts are coming later. Please choose photos only.",
};

export const LAUNCH_LIMITS = {
  postMaxChars: 1200,
  commentMaxChars: 600,
  maxLinksPerPost: 3,
  maxLinksPerComment: 1,
  exactDuplicateWindowMs: 2 * 60 * 1000,
  nearDuplicateWindowMs: 10 * 60 * 1000,
  nearDuplicateLimit: 3,
  nearDuplicateSimilarity: 0.82,
} as const;

export type PublicationRejection = {
  ok: false;
  outcome: PublicationOutcome;
  /** Internal rule identifier for audit logs. Never sent to clients. */
  ruleId: string;
};

export type PublicationAcceptance = {
  ok: true;
  /** Display text with unsafe control characters removed; otherwise verbatim. */
  text: string;
  /** Normalized comparison hash used for duplicate detection. */
  fingerprint: string;
  linkCount: number;
};

// ---------------------------------------------------------------------------
// Text handling
// ---------------------------------------------------------------------------

// C0/C1 controls except tab, newline, carriage return; plus zero-width and
// bidi override characters that are used to disguise text.
const UNSAFE_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Removes unsafe control characters without rewriting the user's wording. */
export function sanitizeUserText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(UNSAFE_CHARACTERS, "").trim();
}

/** Comparison form only: never stored as the display text (plan 21.1). */
export function normalizeForComparison(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contentFingerprint(text: string): string {
  return createHash("sha256").update(normalizeForComparison(text)).digest("hex");
}

function characterTrigrams(text: string) {
  const normalized = normalizeForComparison(text);
  const grams = new Set<string>();
  for (let index = 0; index <= normalized.length - 3; index += 1) {
    grams.add(normalized.slice(index, index + 3));
  }
  return grams;
}

/** Conservative Dice similarity for repeated long-form spam with small edits. */
export function nearDuplicateSimilarity(first: string, second: string) {
  const left = normalizeForComparison(first);
  const right = normalizeForComparison(second);
  if (left === right) return 1;
  if (Math.min(left.length, right.length) < 20) return 0;
  const leftGrams = characterTrigrams(left);
  const rightGrams = characterTrigrams(right);
  if (leftGrams.size === 0 || rightGrams.size === 0) return 0;
  let shared = 0;
  for (const gram of leftGrams) if (rightGrams.has(gram)) shared += 1;
  return (2 * shared) / (leftGrams.size + rightGrams.size);
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

const SCHEME_PATTERN = /\b([a-z][a-z0-9+.-]{1,15}):(?:\/\/|[^\s/]{2})/giu;
const WEB_LINK_PATTERN = /\b(?:https?:\/\/[^\s<>"']+|www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"']*)/giu;
const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

// Versioned blocklist of hosts that may never appear in Community content.
// Entries match the host and any subdomain. Trust & Safety owns this list;
// keep it in this module so a change bumps LAUNCH_POLICY_VERSION.
export const BLOCKED_LINK_HOSTS: readonly string[] = [];

function hostOf(link: string): string | null {
  try {
    const url = new URL(link.startsWith("www.") ? `https://${link}` : link);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function evaluateLinks(text: string, maxLinks: number):
  | { ok: true; linkCount: number }
  | { ok: false; ruleId: string } {
  for (const match of text.matchAll(SCHEME_PATTERN)) {
    const scheme = match[1].toLowerCase();
    // Ignore things that merely look like schemes (e.g. "note: this" or times
    // like 10:30) by requiring a known URL-ish shape for unknown schemes.
    if (ALLOWED_SCHEMES.has(scheme)) continue;
    if (/^(javascript|data|vbscript|file|ftp|blob|about|chrome|ms-[a-z]+|intent|itms(?:-[a-z]+)?)$/i.test(scheme)) {
      return { ok: false, ruleId: `link.scheme.${scheme}` };
    }
    if (match[0].includes("://")) {
      return { ok: false, ruleId: `link.scheme.${scheme}` };
    }
  }

  const links = [...text.matchAll(WEB_LINK_PATTERN)].map((match) => match[0]);
  if (links.length > maxLinks) return { ok: false, ruleId: "link.count" };

  for (const link of links) {
    const host = hostOf(link);
    if (!host) return { ok: false, ruleId: "link.unparseable" };
    if (BLOCKED_LINK_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
      return { ok: false, ruleId: "link.blocked_host" };
    }
  }
  return { ok: true, linkCount: links.length };
}

// ---------------------------------------------------------------------------
// High-confidence objectionable-content patterns
// ---------------------------------------------------------------------------

type ContentRule = { id: string; test: (text: string, normalized: string) => boolean };

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]);
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

// Targeted dehumanizing slurs. Deliberately data, not code: the approved
// pattern list is a Trust & Safety policy decision (plan 21.1, "high-confidence
// ... approved by policy") and must be populated before the public beta.
// Each entry is matched as a whole word, case-insensitively.
export const TARGETED_SLUR_TERMS: readonly string[] = [];

const CONTENT_RULES: readonly ContentRule[] = [
  {
    // Exposed private information: US Social Security number shape.
    id: "pii.ssn",
    test: (text) => /\b(?!000|666|9\d\d)\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b/.test(text),
  },
  {
    // Exposed private information: a major-network payment card number
    // (15-16 digits, leading 3-6) that also passes the Luhn check.
    id: "pii.payment_card",
    test: (text) => [...text.matchAll(/\b[3-6](?:\d[ -]?){14,15}\b/g)]
      .map((match) => match[0].replace(/[ -]/g, ""))
      .some((digits) => (digits.length === 15 || digits.length === 16) && luhnValid(digits)),
  },
  {
    // Direct, first-person threat of lethal violence against a person.
    id: "threat.direct_lethal",
    test: (_, normalized) =>
      /\b(?:i am|i m|im|i will|i ll|ill|we will|we ll) (?:going to |gonna |about to )?(?:kill|murder|shoot|stab|execute) (?:you|u|him|her|them|your (?:family|kids|children|wife|husband))\b/.test(normalized),
  },
  {
    // Explicit sexual exploitation solicitation involving minors.
    id: "exploitation.minor_solicitation",
    test: (_, normalized) =>
      /\b(?:child|children|kid|kids|preteen|pre teen|underage|under age|minor|minors|toddler|infant)\b.{0,40}\b(?:porn|pornography|nudes?|sex(?:ual)? (?:pics?|photos?|videos?|content)|xxx)\b/.test(normalized)
      || /\b(?:porn|pornography|nudes?)\b.{0,40}\b(?:child|children|kid|kids|preteen|underage|minors?)\b/.test(normalized),
  },
  {
    // Known scam phrasing: demanding untraceable payment instruments.
    id: "scam.untraceable_payment",
    test: (_, normalized) =>
      /\b(?:send|pay|buy|purchase|deposit)\b.{0,50}\b(?:gift ?cards?|steam ?cards?|itunes ?cards?|google ?play ?cards?|western union|moneygram)\b/.test(normalized)
      && /\b(?:before|first|to (?:hold|reserve|secure)|deposit|shipping fee|processing fee)\b/.test(normalized),
  },
  {
    id: "harassment.targeted_slur",
    test: (_, normalized) =>
      TARGETED_SLUR_TERMS.length > 0
      && new RegExp(`\\b(?:${TARGETED_SLUR_TERMS.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "u").test(normalized),
  },
];

export function evaluateContentPolicy(text: string): { ok: true } | { ok: false; ruleId: string } {
  const normalized = normalizeForComparison(text);
  for (const rule of CONTENT_RULES) {
    if (rule.test(text, normalized)) return { ok: false, ruleId: rule.id };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Composite evaluation
// ---------------------------------------------------------------------------

export function evaluateTextForPublication(
  input: string,
  kind: "post" | "comment",
): PublicationAcceptance | PublicationRejection {
  const text = sanitizeUserText(input);
  const maxChars = kind === "post" ? LAUNCH_LIMITS.postMaxChars : LAUNCH_LIMITS.commentMaxChars;
  if (text.length === 0 || text.length > maxChars) {
    return { ok: false, outcome: "validation_failed", ruleId: "text.length" };
  }

  const links = evaluateLinks(
    text,
    kind === "post" ? LAUNCH_LIMITS.maxLinksPerPost : LAUNCH_LIMITS.maxLinksPerComment,
  );
  if (!links.ok) return { ok: false, outcome: "unsafe_link", ruleId: links.ruleId };

  const policy = evaluateContentPolicy(text);
  if (!policy.ok) return { ok: false, outcome: "content_not_allowed", ruleId: policy.ruleId };

  return { ok: true, text, fingerprint: contentFingerprint(text), linkCount: links.linkCount };
}

/**
 * Duplicate handling (plan 21.1): reject an exact normalized duplicate by the
 * same author within two minutes, and rate-limit three or more near-duplicate
 * submissions within ten minutes. `recent` is the author's recent content in
 * the same destination, newest first.
 */
export function evaluateDuplicates(
  content: string,
  recent: ReadonlyArray<{ content: string; created_at: string }>,
  now = Date.now(),
): { ok: true } | PublicationRejection {
  const fingerprint = contentFingerprint(content);
  let sameWithinNearWindow = 0;
  for (const item of recent) {
    const age = now - new Date(item.created_at).getTime();
    if (age > LAUNCH_LIMITS.nearDuplicateWindowMs) continue;
    const exact = contentFingerprint(item.content) === fingerprint;
    if (exact && age <= LAUNCH_LIMITS.exactDuplicateWindowMs) {
      return { ok: false, outcome: "duplicate_content", ruleId: "duplicate.exact" };
    }
    if (exact || nearDuplicateSimilarity(content, item.content) >= LAUNCH_LIMITS.nearDuplicateSimilarity) {
      sameWithinNearWindow += 1;
    }
  }
  if (sameWithinNearWindow >= LAUNCH_LIMITS.nearDuplicateLimit) {
    return { ok: false, outcome: "rate_limited", ruleId: "duplicate.near" };
  }
  return { ok: true };
}

/** HTTP status for a publication outcome on the JSON API (plan 30.1). */
export const PUBLICATION_OUTCOME_STATUS: Record<PublicationOutcome, number> = {
  validation_failed: 400,
  unsafe_link: 422,
  duplicate_content: 409,
  rate_limited: 429,
  content_not_allowed: 422,
  invalid_media: 415,
  media_safety_unavailable: 503,
  posting_restricted: 403,
  unauthorized_audience: 403,
  posting_unavailable: 503,
  unsupported_media: 415,
};
