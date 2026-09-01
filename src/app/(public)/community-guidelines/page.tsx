import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN } from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description: "Rules for PerfectPPI posts, comments, reviews, listings, messages, and media.",
  alternates: { canonical: `${CANONICAL_ORIGIN}/community-guidelines` },
};

export default function CommunityGuidelinesPage() {
  return (
    <LegalDocument title="Community Guidelines" description="These rules apply to posts, comments, reviews, listings, profiles, messages, attachments, and other user-submitted content.">
      <h2>Be accurate and authentic</h2>
      <p>Do not impersonate others, fabricate inspection evidence or reviews, conceal a material relationship, misstate credentials, manipulate ratings, or post a vehicle you are not authorized to list. Honest positive and negative opinions are allowed.</p>

      <h2>Protect privacy and property</h2>
      <p>Share only content you have the right to use. Do not expose private messages, account credentials, precise home locations, financial information, unnecessary VIN or plate details, or another person&apos;s face or personal information without an appropriate basis and permission.</p>

      <h2>Keep people safe</h2>
      <p>Threats, targeted harassment, hate, sexual exploitation, child sexual abuse material, non-consensual intimate content, instructions for self-harm, graphic violence, fraud, malware, illegal sales, and conduct that creates an immediate vehicle or personal-safety risk are prohibited. Contact emergency services for imminent danger.</p>

      <h2>No spam or platform abuse</h2>
      <p>Do not send unsolicited promotions, repeat deceptive content, scrape users, evade blocks or enforcement, coordinate fake engagement, probe private systems, or upload content designed to defeat moderation.</p>

      <h2>Moderation and appeals</h2>
      <p>Text and still images may receive automated review; video receives manual review in the current release. Content may be held while reviewed. Severe or apparently illegal content may be preserved under restricted access and escalated as required. Authors receive notice where appropriate and can appeal eligible decisions. Reports made in good faith are protected; knowingly false or abusive reports may lead to enforcement.</p>

      <h2>Copyright complaints</h2>
      <p>Use the Copyright Complaints page for infringement notices. PerfectPPI may remove material and address repeat infringement, but formal DMCA safe-harbor procedures depend on designating and registering an agent after business-owner and counsel approval.</p>
    </LegalDocument>
  );
}
