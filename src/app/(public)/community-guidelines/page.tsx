import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import {
  CANONICAL_ORIGIN,
  DISCLOSURES_LAST_UPDATED,
  MODERATION_RESPONSE_TARGETS,
} from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description: "Rules for PerfectPPI posts, comments, reviews, listings, profiles, messages, and media, and how reporting and moderation work.",
  alternates: { canonical: `${CANONICAL_ORIGIN}/community-guidelines` },
};

// Plan sections 3.3, 3.4, 16-19, 31.4: this page must describe the moderation
// configuration that is actually shipped. When a server flag changes what
// publishes automatically, this copy changes with it.
export default function CommunityGuidelinesPage() {
  return (
    <LegalDocument
      title="Community Guidelines"
      description="These rules apply to posts, comments, reviews, listings, profiles, usernames, messages, attachments, and other content you submit to PerfectPPI. They exist so the Community stays useful for people who own, inspect, repair, buy, and sell vehicles."
      updated={DISCLOSURES_LAST_UPDATED}
      version="community-guidelines-2026-09-10"
    >
      <h2>What the Community is for</h2>
      <p>
        Document a vehicle, solve a problem, learn from owners and technicians, evaluate a purchase, and sell with trustworthy history. Posts that help someone do one of those things belong here. Content that exists only to provoke, sell unrelated products, or farm attention does not.
      </p>

      <h2>Be accurate and authentic</h2>
      <p>
        Use one account and your real ownership context. Do not impersonate another person, shop, or manufacturer; fabricate inspection evidence, mileage, service history, or reviews; conceal a material relationship with a seller or shop; misstate credentials; manipulate ratings; or list a vehicle you are not authorized to sell. Honest positive and negative opinions are welcome.
      </p>

      <h2>Vehicle safety comes first</h2>
      <p>
        Community answers are not a professional diagnosis. Do not present guesswork as certainty on brakes, steering, airbags, fuel systems, vehicle lifting and jack points, wheel fasteners, or high-voltage EV systems, and do not encourage anyone to disable a safety system, ignore a recall, or drive a vehicle that is not safe to drive. Speed runs, street-racing challenges, and content that encourages dangerous driving are not allowed. PerfectPPI labels some topics with a safety notice; treat it seriously and get qualified help for anything you would not stake your life on.
      </p>

      <h2>No scams or unsafe transactions</h2>
      <p>
        Do not solicit deposits before a buyer has seen a vehicle, ask for gift cards, wire transfers, or other untraceable payment, post a listing you do not control, advertise title washing, odometer tampering, or emissions-defeat parts, or move a conversation off-platform to avoid PerfectPPI protections. Report suspicious listings and messages rather than warning other members in public with unverified accusations.
      </p>

      <h2>Respect people</h2>
      <p>
        Disagree about cars, not about people. Threats, targeted harassment, bullying, hate or dehumanizing content, sexual content, sexual exploitation, child sexual abuse material, non-consensual intimate imagery, and instructions for self-harm are prohibited and may be preserved and escalated as the law requires. Do not organize brigading against a member, shop, or seller.
      </p>

      <h2>Protect privacy</h2>
      <p>
        Share only what you have the right to share. Do not post another person&apos;s home address, precise live location, phone number, full VIN, plate in a way that identifies a private owner, documents, signatures, private messages, or face without an appropriate basis. Your own vehicle&apos;s VIN, receipts, and inspection details stay private unless you choose to show a redacted summary. PerfectPPI removes location and device metadata from photos you publish, but it cannot remove what is visible in the picture.
      </p>

      <h2>No spam or platform abuse</h2>
      <p>
        No unsolicited promotion, repeated or near-duplicate posting, link farming, scraping, fake engagement, evasion of a block or restriction, alternate accounts to get around enforcement, or uploads designed to defeat safety checks. Posts are limited to a small number of links; executable and disguised links are rejected.
      </p>

      <h2>How publishing works right now</h2>
      <p>
        Ordinary text posts and comments publish immediately after automatic server checks for length, link safety, duplicate and rapid posting, and a small set of high-confidence disallowed patterns such as exposed personal information, direct threats, and known scam phrasing. There is no routine human or AI approval step before an ordinary text post appears. Still photos are checked against a specialist illegal-image safeguard and re-encoded with metadata removed before they publish; if that safeguard is unavailable, new photos wait rather than publish unchecked. Community video is not available in this release. Existing content that was previously pending, rejected, or held remains unavailable.
      </p>

      <h2>Reporting</h2>
      <p>
        Every post and comment you did not write has a report control. Choose the reason that best describes what you observed and add details when asked. A first valid report hides the post or comment from everyone while the PerfectPPI team reviews it; reporting a comment hides only that comment. The author is never told who reported them. Reports are rate-limited, and reports the team determines were knowingly false or abusive can lead to enforcement against the reporter. For imminent danger to a person, contact local emergency services; PerfectPPI is not an emergency service.
      </p>

      <h2>Blocking and muting</h2>
      <p>
        Blocking a member removes each of you from the other&apos;s posts, comments, search, suggestions, and messages, cancels any pending requests, and is not announced. Muting hides a member&apos;s posts from you without changing anything for them. Both are managed from your privacy settings and can be reversed.
      </p>

      <h2>Moderation decisions and appeals</h2>
      <p>
        A trained member of the PerfectPPI team reviews hidden content and chooses one of three outcomes: restore it to its original audience, remove it from the Community, or preserve it under restricted legal review. We aim to review urgent reports (threats, exposed personal information, suspected illegal content) within {MODERATION_RESPONSE_TARGETS.urgentHours} hours and other reports within {MODERATION_RESPONSE_TARGETS.ordinaryHours} hours. Authors are notified of the outcome and, when content is removed, told which policy applied and how to appeal; appeals are normally reviewed within {MODERATION_RESPONSE_TARGETS.appealHours} hours by someone other than the original reviewer when staffing permits. Depending on severity and history, enforcement may include a warning, a temporary posting, media, or reporting hold, suspension, or a permanent ban. Every decision is recorded and auditable.
      </p>

      <h2>What removal means</h2>
      <p>
        Removing content takes it off every PerfectPPI surface and stops it from being retrieved again. The underlying record, reports, and evidence are retained under restricted access for an approved retention period so that appeals, legal obligations, and abuse prevention can be honored, then disposed of; a legal hold keeps evidence for as long as the hold applies. Deleting your account removes your public identity immediately but does not shorten that period for content already under review or confirmed as a violation. PerfectPPI cannot recall copies that other people already saved or screenshotted.
      </p>

      <h2>Copyright and other complaints</h2>
      <p>
        Use the <Link href="/copyright">Copyright Complaints</Link> page for infringement notices; intellectual-property reports require a written explanation. For anything else, or if you believe a decision was wrong, see <Link href="/support">Support &amp; Safety</Link>.
      </p>
    </LegalDocument>
  );
}
