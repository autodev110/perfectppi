import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import {
  CANONICAL_ORIGIN,
  DISCLOSURES_LAST_UPDATED,
  LEGAL_CONTACT_EMAIL,
  MODERATION_RESPONSE_TARGETS,
} from "@/lib/legal/constants";
import { t as uiText } from "@/lib/i18n";

export const metadata: Metadata = {
  title: uiText("ui.support_safety_8c5afaf04f"),
  description: uiText("ui.contact_perfectppi_for_account_inspection_sa_60b3c30dae"),
  alternates: { canonical: `${CANONICAL_ORIGIN}/support` },
};

// Plan section 31.4: the Help & Safety surface. This page is also the App
// Store support URL, so it must carry a monitored contact method, response
// expectations, report/block guidance, appeals, the emergency disclaimer,
// and the copyright process.
export default function SupportPage() {
  return (
    <LegalDocument
      title={uiText("ui.support_safety_8c5afaf04f")}
      description={uiText("ui.contact_the_perfectppi_team_learn_how_report_a63e1ac5c2")}
      updated={DISCLOSURES_LAST_UPDATED}
      version="support-2026-09-10"
    >
      <h2>{uiText("ui.contact_2b5c3d2672")}</h2>
      <p>{uiText("ui.email_009557a4da")}<a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>{uiText("ui.this_inbox_is_monitored_by_the_perfectppi_te_de846577a0")}</p>

      <h2>{uiText("ui.urgent_safety_77178cb7cf")}</h2>
      <p>{uiText("ui.perfectppi_is_not_an_emergency_service_and_d_bffb0beb6d")}</p>

      <h2>{uiText("ui.reporting_community_content_6c903a7404")}</h2>
      <p>{uiText("ui.every_post_and_comment_you_did_not_write_has_004cdf4407")}<Link href="/community-guidelines">{uiText("ui.community_guidelines_5e0f74c160")}</Link>{uiText("ui.for_what_is_and_is_not_allowed_33a720bbf7")}</p>

      <h2>{uiText("ui.blocking_and_muting_0120b87260")}</h2>
      <p>{uiText("ui.block_a_member_from_their_profile_or_from_an_996be6fded")}</p>

      <h2>{uiText("ui.response_expectations_2bca1f7355")}</h2>
      <p>{uiText("ui.we_aim_to_complete_a_first_human_review_of_u_b35bdf9219")}{MODERATION_RESPONSE_TARGETS.urgentHours}{uiText("ui.hours_and_of_other_hidden_content_within_b50afeff4a")}{MODERATION_RESPONSE_TARGETS.ordinaryHours}{uiText("ui.hours_support_email_is_answered_on_business__cce4b660c5")}</p>

      <h2>{uiText("ui.appeals_03e8c5a569")}</h2>
      <p>{uiText("ui.if_your_post_or_comment_was_removed_the_noti_ffeccde8c3")}{MODERATION_RESPONSE_TARGETS.appealHours}{uiText("ui.hours_by_someone_other_than_the_original_rev_30385e3f4d")}</p>

      <h2>{uiText("ui.account_and_identity_759bc06db8")}</h2>
      <p>{uiText("ui.contact_us_for_sign_in_problems_suspected_co_92cb399fbf")}<Link href="/privacy-choices">{uiText("ui.your_privacy_choices_001864d293")}</Link>{uiText("ui.or_the_app_s_privacy_account_screen_if_you_s_fbc73a1a40")}</p>

      <h2>{uiText("ui.report_or_content_correction_2b49dde3de")}</h2>
      <p>{uiText("ui.identify_the_output_or_content_and_explain_w_4b12cab6f2")}</p>

      <h2>{uiText("ui.copyright_and_intellectual_property_9603cece7e")}</h2>
      <p>{uiText("ui.use_the_8f5f60fb25")}<Link href="/copyright">{uiText("ui.copyright_complaints_8d9566d40f")}</Link>{uiText("ui.page_for_infringement_notices_or_choose_the__0c534784d6")}</p>

      <h2>{uiText("ui.privacy_and_accessibility_eacbee815d")}</h2>
      <p>{uiText("ui.privacy_requests_can_be_initiated_from_36cf165ff8")}<Link href="/privacy-choices">{uiText("ui.your_privacy_choices_001864d293")}</Link>{uiText("ui.accessibility_barriers_can_be_reported_by_em_4a018f1fb0")}</p>
    </LegalDocument>
  );
}
