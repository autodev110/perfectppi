import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "AI Processing Disclosure",
  description: "How PerfectPPI uses AI for reports, VIN reading, coverage-related outputs, and moderation.",
  alternates: { canonical: `${CANONICAL_ORIGIN}/ai-disclosure` },
};

export default function AiDisclosurePage() {
  return (
    <LegalDocument title="AI Processing Disclosure" description="Where AI is used, what information it receives, and why human review remains important.">
      <h2>Inspection and VIN features</h2>
      <p>
        PerfectPPI uses Google Gemini 2.5 Flash to read VIN images and to generate structured inspection and coverage-related outputs. Depending on the feature, inputs can include VIN, vehicle details, mileage, inspection questions and answers, technician notes, OBD trouble codes, warning-light status, readiness monitors, live readings, and report context.
      </p>

      <h2>Community moderation</h2>
      <p>
        PerfectPPI uses OpenAI&apos;s moderation service for community text and still images. Results can allow content, hold it for review, block it, or place it under restricted legal review. Uploaded videos are held for manual review in the current implementation. Native anti-spam rules also evaluate limited content patterns.
      </p>

      <h2>Important limitations</h2>
      <p>
        AI can misunderstand images, diagnostic data, or human answers and can omit or invent details. AI output is assistance, not a mechanic&apos;s diagnosis, safety certification, appraisal, title report, legal advice, insurance decision, or binding service-contract determination. A qualified person should review material findings and the issued contract controls any actual coverage.
      </p>

      <h2>Human review and correction</h2>
      <p>
        You may report an inaccurate inspection output through Support. Content authors may appeal eligible moderation decisions. PerfectPPI should not rely solely on AI for technician access, claims, safety determinations, warranty eligibility, or another decision producing legal or similarly significant effects.
      </p>

      <h2>Vendor controls</h2>
      <p>
        API keys remain server-side. PerfectPPI minimizes model inputs and does not intentionally include passwords or full payment-card details. Vendor retention, training, regional processing, security terms, and data-processing agreements require continuing contract and configuration review.
      </p>
    </LegalDocument>
  );
}
