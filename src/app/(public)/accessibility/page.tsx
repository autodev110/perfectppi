import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN, LEGAL_CONTACT_EMAIL } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description: "PerfectPPI accessibility goals and feedback channel.",
  alternates: { canonical: `${CANONICAL_ORIGIN}/accessibility` },
};

export default function AccessibilityPage() {
  return (
    <LegalDocument title="Accessibility Statement" description="PerfectPPI is working toward an accessible web and iOS experience and welcomes reports of barriers.">
      <h2>Our goal</h2>
      <p>PerfectPPI uses WCAG 2.2 Level AA as an engineering target. This is a target, not a claim that every page, document, third-party integration, or native screen currently conforms.</p>

      <h2>Current work</h2>
      <p>Work includes semantic headings and controls, keyboard operation, visible focus, text alternatives, error identification, contrast, zoom and reflow, reduced motion, accessible authentication, Dynamic Type, and VoiceOver testing. Automated testing is paired with manual review because automated results alone cannot establish accessibility.</p>

      <h2>Request assistance</h2>
      <p>Email <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=PerfectPPI%20accessibility`}>{LEGAL_CONTACT_EMAIL}</a> with the page or screen, device, browser or app version, assistive technology, and the barrier. We will work to provide the information or service through an accessible alternative where reasonably available.</p>
    </LegalDocument>
  );
}

