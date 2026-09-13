export const LEGAL_VERSION = "1.0.0";
export const TERMS_VERSION = `terms-${LEGAL_VERSION}`;
export const TERMS_SHA256 =
  "cf8a34e90e0dfce3065a6d90110e98c708d890f0033e224c13a284aa1c16d026";
export const PRIVACY_VERSION = `privacy-${LEGAL_VERSION}`;
export const LEGAL_EFFECTIVE_DATE = "September 2, 2026";
export const LEGAL_LAST_UPDATED = "September 2, 2026";
// Non-assent disclosures (Community Guidelines, AI Processing Disclosure,
// Privacy Policy, Support & Safety) are revised to match the shipped social
// configuration without changing the Terms version users accepted.
export const DISCLOSURES_LAST_UPDATED = "September 13, 2026";
export const MODERATION_RESPONSE_TARGETS = {
  urgentHours: 4,
  ordinaryHours: 24,
  appealHours: 72,
} as const;
export const COMPANY_NOTICE =
  "PerfectPPI is a product managed by DnD Solutions & Optimization LLC.";
export const LEGAL_CONTACT_EMAIL = "info@dndsolutions.io";
export const CANONICAL_ORIGIN = "https://www.perfectppi.com";
