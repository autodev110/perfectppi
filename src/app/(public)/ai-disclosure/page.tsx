import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN, DISCLOSURES_LAST_UPDATED } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "AI Processing Disclosure",
  description: "How PerfectPPI uses AI for reports, VIN reading, coverage-related outputs, and moderation.",
  alternates: { canonical: `${CANONICAL_ORIGIN}/ai-disclosure` },
};

export default function AiDisclosurePage() {
  return (
    <LegalDocument
      title="AI Processing Disclosure"
      description="Where AI is used, what information it receives, and why human review remains important."
      updated={DISCLOSURES_LAST_UPDATED}
      version="ai-disclosure-2026-09-10"
    >
      <h2>Inspection and VIN features</h2>
      <p>
        PerfectPPI uses Google Gemini 2.5 Flash to read VIN images and to generate structured inspection and coverage-related outputs. Depending on the feature, inputs can include VIN, vehicle details, mileage, inspection questions and answers, technician notes, OBD trouble codes, warning-light status, readiness monitors, live readings, and report context.
      </p>

      <h2>Community moderation</h2>
      <p>
        In the current release, ordinary Community text posts and comments are <strong>not</strong> sent to Gemini or any other general-purpose AI classifier before they publish. They pass deterministic server checks (length, link safety, duplicate and rapid posting, and a versioned list of high-confidence disallowed patterns such as exposed personal information, direct threats, and known scam phrasing) and then appear immediately. Still photos are checked by a configured specialist illegal-content safeguard that matches against known illegal material and are re-encoded with metadata removed; a matched, uncertain, or unavailable safeguard result means the photo is not published. Community video uploads are disabled.
      </p>
      <p>
        Moderation decisions on reported content are made by people. Member reports hide content pending human review; automated systems do not remove reported Community content on their own. A general-purpose AI publication gate for Community text and photos exists as a server-controlled capability that is switched off; if it is enabled, this disclosure and the Community Guidelines will be updated first.
      </p>

      <h2>Important limitations</h2>
      <p>
        AI can misunderstand images, diagnostic data, or human answers and can omit or invent details. AI output is assistance, not a mechanic&apos;s diagnosis, safety certification, appraisal, title report, legal advice, insurance decision, or binding service-contract determination. A qualified person should review material findings and the issued contract controls any actual coverage.
      </p>

      <h2>Human review and correction</h2>
      <p>
        You may report an inaccurate inspection output through Support. Content authors are notified of moderation decisions and may appeal removals. PerfectPPI does not rely solely on AI for technician access, claims, safety determinations, warranty eligibility, Community removals, account enforcement, or another decision producing legal or similarly significant effects.
      </p>

      <h2>Vendor controls</h2>
      <p>
        API keys remain server-side. PerfectPPI minimizes model and scanner inputs and does not intentionally include passwords or full payment-card details. Vendor retention, training, regional processing, security terms, and data-processing agreements require continuing contract and configuration review.
      </p>
    </LegalDocument>
  );
}
