import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import {
  CANONICAL_ORIGIN,
  DISCLOSURES_LAST_UPDATED,
  MODERATION_RESPONSE_TARGETS,
} from "@/lib/legal/constants";
import { t as uiText } from "@/lib/i18n";

export const metadata: Metadata = {
  title: uiText("ui.community_guidelines_5e0f74c160"),
  description: uiText("ui.rules_for_perfectppi_posts_comments_reviews__e991fe0762"),
  alternates: { canonical: `${CANONICAL_ORIGIN}/community-guidelines` },
};

// Plan sections 3.3, 3.4, 16-19, 31.4: this page must describe the moderation
// configuration that is actually shipped. When a server flag changes what
// publishes automatically, this copy changes with it.
export default function CommunityGuidelinesPage() {
  return (
    <LegalDocument
      title={uiText("ui.community_guidelines_5e0f74c160")}
      description={uiText("ui.these_rules_apply_to_posts_comments_reviews__00cc415583")}
      updated={DISCLOSURES_LAST_UPDATED}
      version="community-guidelines-2026-09-10"
    >
      <h2>{uiText("ui.what_the_community_is_for_92a28bd2d2")}</h2>
      <p>{uiText("ui.document_a_vehicle_solve_a_problem_learn_fro_ac98146c50")}</p>

      <h2>{uiText("ui.be_accurate_and_authentic_278eeb39ef")}</h2>
      <p>{uiText("ui.use_one_account_and_your_real_ownership_cont_8ff749abd9")}</p>

      <h2 id="vehicle-safety">{uiText("ui.vehicle_safety_comes_first_18b4523c65")}</h2>
      <p>{uiText("ui.community_answers_are_not_a_professional_dia_9c3ed1fba7")}</p>

      <h2>{uiText("ui.no_scams_or_unsafe_transactions_1817766f2f")}</h2>
      <p>{uiText("ui.do_not_solicit_deposits_before_a_buyer_has_s_213ac50dcf")}</p>

      <h2>{uiText("ui.respect_people_d573becc2d")}</h2>
      <p>{uiText("ui.disagree_about_cars_not_about_people_threats_ab771b6148")}</p>

      <h2>{uiText("ui.protect_privacy_58cea86e53")}</h2>
      <p>{uiText("ui.share_only_what_you_have_the_right_to_share__0de691668a")}</p>

      <h2>{uiText("ui.no_spam_or_platform_abuse_8baa7641c2")}</h2>
      <p>{uiText("ui.no_unsolicited_promotion_repeated_or_near_du_0c18f5bff1")}</p>

      <h2>{uiText("ui.how_publishing_works_right_now_ac3df62ff5")}</h2>
      <p>{uiText("ui.ordinary_text_posts_and_comments_publish_imm_ba80550d29")}</p>

      <h2>{uiText("ui.reporting_b1fa104b9b")}</h2>
      <p>{uiText("ui.every_post_and_comment_you_did_not_write_has_c41b900811")}</p>

      <h2>{uiText("ui.blocking_and_muting_0120b87260")}</h2>
      <p>{uiText("ui.blocking_a_member_removes_each_of_you_from_t_61fd2b6f36")}</p>

      <h2>{uiText("ui.moderation_decisions_and_appeals_4cc0c76f8b")}</h2>
      <p>{uiText("ui.a_trained_member_of_the_perfectppi_team_revi_87b501a43a")}{MODERATION_RESPONSE_TARGETS.urgentHours}{uiText("ui.hours_and_other_reports_within_375ea02651")}{MODERATION_RESPONSE_TARGETS.ordinaryHours}{uiText("ui.hours_authors_are_notified_of_the_outcome_an_7882609457")}{MODERATION_RESPONSE_TARGETS.appealHours}{uiText("ui.hours_by_someone_other_than_the_original_rev_6206f7ca1e")}</p>

      <h2>{uiText("ui.what_removal_means_748bea37c6")}</h2>
      <p>{uiText("ui.removing_content_takes_it_off_every_perfectp_bbaf033655")}</p>

      <h2>{uiText("ui.copyright_and_other_complaints_2d28e3c17d")}</h2>
      <p>{uiText("ui.use_the_8f5f60fb25")}<Link href="/copyright">{uiText("ui.copyright_complaints_8d9566d40f")}</Link>{uiText("ui.page_for_infringement_notices_intellectual_p_a8c89b3a02")}<Link href="/support">{uiText("ui.support_safety_8c5afaf04f")}</Link>.
      </p>
    </LegalDocument>
  );
}
