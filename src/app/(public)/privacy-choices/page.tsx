import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN, LEGAL_CONTACT_EMAIL } from "@/lib/legal/constants";
import { t as uiText } from "@/lib/i18n";

export const metadata: Metadata = {
  title: uiText("ui.your_privacy_choices_001864d293"),
  description: uiText("ui.request_access_correction_export_deletion_ap_2d164f9051"),
  alternates: { canonical: `${CANONICAL_ORIGIN}/privacy-choices` },
};

export default function PrivacyChoicesPage() {
  return (
    <LegalDocument title={uiText("ui.your_privacy_choices_001864d293")} description={uiText("ui.a_nationwide_request_channel_for_access_corr_e4b29a9279")}>
      <h2>{uiText("ui.available_requests_10a4d42b93")}</h2>
      <ul>
        <li>{uiText("ui.know_or_access_the_information_associated_wi_d6faf1e789")}</li>
        <li>{uiText("ui.correct_inaccurate_account_or_vehicle_inform_9d9320f1bc")}</li>
        <li>{uiText("ui.receive_a_portable_copy_of_applicable_inform_367d640a50")}</li>
        <li>{uiText("ui.delete_your_account_and_associated_informati_1370fca1f1")}</li>
        <li>{uiText("ui.opt_out_of_sale_targeted_advertising_or_qual_8fceb037bb")}</li>
        <li>{uiText("ui.appeal_a_privacy_request_decision_1501b111c6")}</li>
        <li>{uiText("ui.submit_a_request_as_an_authorized_agent_39d791448f")}</li>
      </ul>

      <h2>{uiText("ui.product_analytics_2f050a0755")}</h2>
      <p>{uiText("ui.signed_in_users_can_turn_first_party_product_ab417f09cd")}<Link href="/dashboard/settings#privacy">{uiText("ui.account_settings_d0f9bc7a3b")}</Link>{uiText("ui.turning_it_off_stops_new_product_events_and__0eeeb7836f")}</p>

      <h2>{uiText("ui.submit_securely_db86da6bfc")}</h2>
      <p>{uiText("ui.if_you_have_an_account_sign_in_and_open_4c8de0ce02")}<Link href="/dashboard/settings#privacy">{uiText("ui.account_settings_d0f9bc7a3b")}</Link>{uiText("ui.the_authenticated_request_record_lets_you_tr_48a19f1303")}{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=PerfectPPI%20privacy%20request`}>{LEGAL_CONTACT_EMAIL}</a>
        {" "}{uiText("ui.with_the_request_type_and_the_email_associat_38cd78a5d4")}</p>

      <h2>{uiText("ui.verification_timing_and_appeals_4682baeab3")}</h2>
      <p>{uiText("ui.we_verify_requests_in_proportion_to_their_se_494acc523a")}</p>

      <h2>{uiText("ui.global_privacy_control_c8593a2258")}</h2>
      <p>{uiText("ui.where_applicable_perfectppi_recognizes_globa_cb52690d30")}</p>

      <h2>{uiText("ui.account_deletion_f2a90e6c2f")}</h2>
      <p>{uiText("ui.an_authenticated_deletion_request_schedules__edcbeed487")}</p>
    </LegalDocument>
  );
}
