import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN } from "@/lib/legal/constants";
import { t as uiText } from "@/lib/i18n";

export const metadata: Metadata = {
  title: uiText("ui.terms_of_service_4afa55bf7a"),
  description: uiText("ui.terms_governing_use_of_perfectppi_bfae888f00"),
  alternates: { canonical: `${CANONICAL_ORIGIN}/terms` },
};

export default function TermsPage() {
  return (
    <LegalDocument title={uiText("ui.terms_of_service_4afa55bf7a")} description={uiText("ui.these_terms_govern_access_to_and_use_of_perf_4b70cbd585")}>
      <h2>{uiText("ui.1_agreement_and_eligibility_d6e4c40c33")}</h2>
      <p>{uiText("ui.by_creating_an_account_or_affirmatively_acce_38eabc856d")}</p>

      <h2>{uiText("ui.2_accounts_and_sign_in_providers_ad6a011c2c")}</h2>
      <p>{uiText("ui.keep_credentials_and_devices_secure_and_noti_06d38073e5")}</p>

      <h2>{uiText("ui.3_roles_and_organizations_0750662740")}</h2>
      <p>{uiText("ui.consumers_technicians_organization_managers__103d625ae1")}</p>

      <h2>{uiText("ui.4_inspections_and_reports_a7a90fa8c0")}</h2>
      <p>{uiText("ui.a_pre_purchase_inspection_records_observatio_a374bb240c")}</p>
      <p>{uiText("ui.an_inspection_report_is_not_a_certification__283a124101")}</p>

      <h2>{uiText("ui.5_obd_and_vehicle_data_a53815a628")}</h2>
      <p>{uiText("ui.obd_scans_can_report_only_information_expose_09c6e12642")}</p>

      <h2>{uiText("ui.6_ai_assisted_features_2b3308495f")}</h2>
      <p>{uiText("ui.perfectppi_uses_ai_to_assist_with_vin_readin_1a38752903")}<Link href="/ai-disclosure">{uiText("ui.ai_processing_disclosure_09c3e9b771")}</Link>{uiText("ui.and_use_support_to_request_correction_or_hum_8ec98a7ceb")}</p>

      <h2>{uiText("ui.7_marketplace_7d9f3a3dfd")}</h2>
      <p>{uiText("ui.sellers_are_responsible_for_listing_accuracy_e43e9f293f")}</p>

      <h2>{uiText("ui.8_community_reviews_messages_and_media_633d61683b")}</h2>
      <p>{uiText("ui.you_retain_ownership_of_content_you_submit_y_bef6f06d43")}</p>
      <p>{uiText("ui.honest_reviews_including_negative_reviews_ar_aea04d26c1")}<Link href="/community-guidelines">{uiText("ui.community_guidelines_5e0f74c160")}</Link>{uiText("ui.law_privacy_intellectual_property_rights_saf_551ad2b2c1")}</p>

      <h2>{uiText("ui.9_payments_signatures_and_service_contracts_49beb24c48")}</h2>
      <p>{uiText("ui.before_a_charge_or_signature_the_applicable__6c358723fc")}</p>
      <p>{uiText("ui.cancellation_refund_free_look_no_show_recurr_2f394becc5")}</p>

      <h2>{uiText("ui.10_electronic_records_d1a7b51954")}</h2>
      <p>{uiText("ui.when_a_transaction_offers_electronic_records_9a8427804b")}</p>

      <h2>{uiText("ui.11_acceptable_use_4e105829df")}</h2>
      <p>{uiText("ui.you_may_not_c90d612b1e")}</p>
      <ul>
        <li>{uiText("ui.use_perfectppi_unlawfully_deceptively_or_to__8c6c46ff65")}</li>
        <li>{uiText("ui.misrepresent_identity_authority_credentials__835518f5f8")}</li>
        <li>{uiText("ui.upload_malware_stolen_content_unlawful_intim_c89f42d80d")}</li>
        <li>{uiText("ui.harass_users_send_spam_scrape_personal_infor_36a51614a3")}</li>
        <li>{uiText("ui.attempt_to_access_another_account_conversati_8ef9dcf2fe")}</li>
        <li>{uiText("ui.reverse_engineer_or_misuse_the_service_excep_73ee0e4701")}</li>
      </ul>

      <h2>{uiText("ui.12_moderation_suspension_and_termination_a5235b9093")}</h2>
      <p>{uiText("ui.we_may_hold_restrict_remove_or_preserve_cont_be253f7676")}<Link href="/privacy-choices">{uiText("ui.your_privacy_choices_001864d293")}</Link>.
      </p>

      <h2>{uiText("ui.13_intellectual_property_and_feedback_98093e5675")}</h2>
      <p>{uiText("ui.perfectppi_s_software_design_branding_and_or_2b8883a3bf")}</p>

      <h2>{uiText("ui.14_third_party_services_3b22089917")}</h2>
      <p>{uiText("ui.third_party_identity_payment_signature_stora_df17eefe69")}</p>

      <h2>{uiText("ui.15_disputes_and_applicable_rights_19af3ae0fe")}</h2>
      <p>{uiText("ui.contact_dec0d13d7e")}<Link href="/support">{uiText("ui.support_be91940b79")}</Link>{uiText("ui.so_we_can_investigate_and_attempt_to_resolve_dfbb1a4b14")}</p>

      <h2>{uiText("ui.16_changes_6b616485d8")}</h2>
      <p>{uiText("ui.we_may_update_these_terms_by_publishing_a_ne_edce1e9a04")}</p>
    </LegalDocument>
  );
}
