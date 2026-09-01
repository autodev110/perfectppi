import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { TERMS_SHA256, TERMS_VERSION } from "./constants";

export type TermsAcceptanceSource =
  | "web_signup"
  | "web_oauth"
  | "ios_signup"
  | "ios_oauth"
  | "reauth";

function networkEvidence(headers: Headers) {
  const salt = process.env.LEGAL_EVIDENCE_SALT;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const networkHash = salt && forwarded
    ? createHash("sha256").update(`${salt}:${forwarded}`).digest("hex")
    : undefined;

  return {
    canonical_url: "https://www.perfectppi.com/terms",
    user_agent: headers.get("user-agent")?.slice(0, 500) ?? null,
    network_hash: networkHash ?? null,
  };
}

export async function recordTermsAcceptance(options: {
  profileId: string;
  source: TermsAcceptanceSource;
  headers: Headers;
}) {
  const { error } = await createAdminClient()
    .from("legal_acceptances")
    .upsert(
      {
        profile_id: options.profileId,
        document_type: "terms",
        document_version: TERMS_VERSION,
        document_hash: TERMS_SHA256,
        source: options.source,
        evidence: networkEvidence(options.headers),
      },
      { onConflict: "profile_id,document_type,document_version", ignoreDuplicates: true },
    );

  if (error) throw new Error(`Could not record Terms acceptance: ${error.message}`);
}

