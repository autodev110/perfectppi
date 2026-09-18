import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN, DISCLOSURES_LAST_UPDATED } from "@/lib/legal/constants";
import { t as uiText } from "@/lib/i18n";

export const metadata: Metadata = {
  title: uiText("ui.privacy_policy_506ff39462"),
  description: uiText("ui.how_perfectppi_collects_uses_discloses_retai_85cce551be"),
  alternates: { canonical: `${CANONICAL_ORIGIN}/privacy` },
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title={uiText("ui.privacy_policy_506ff39462")}
      description={uiText("ui.this_policy_explains_perfectppi_s_data_pract_b174a80e77")}
      updated={DISCLOSURES_LAST_UPDATED}
    >
      <h2>{uiText("ui.1_scope_and_our_role_157026f57a")}</h2>
      <p>{uiText("ui.this_policy_applies_when_perfectppi_determin_7e9df1c491")}</p>

      <h2>{uiText("ui.2_information_we_collect_4a9938c3eb")}</h2>
      <h3>{uiText("ui.account_and_identity_information_0cbec028a4")}</h3>
      <p>{uiText("ui.we_collect_account_identifiers_name_email_ad_f9e73e28d4")}</p>
      <h3>{uiText("ui.vehicle_inspection_and_diagnostic_informatio_185cb8a005")}</h3>
      <p>{uiText("ui.we_collect_vin_year_make_model_trim_mileage__1490159bfa")}</p>
      <h3>{uiText("ui.marketplace_community_and_communications_a9492f945c")}</h3>
      <p>{uiText("ui.we_collect_listings_prices_approximate_listi_6c49971617")}</p>
      <h3>{uiText("ui.social_identity_relationships_and_reports_90b0a0ffce")}</h3>
      <p>{uiText("ui.every_account_has_a_unique_username_which_is_8944b91762")}</p>
      <h3>{uiText("ui.technician_and_organization_information_3ca8bf2779")}</h3>
      <p>{uiText("ui.we_collect_business_and_profile_details_spec_ae60787575")}</p>
      <h3>{uiText("ui.transactions_contracts_and_support_a23bb4633c")}</h3>
      <p>{uiText("ui.we_process_order_selected_plan_price_payment_959c944132")}</p>
      <h3>{uiText("ui.device_and_technical_information_93227e677c")}</h3>
      <p>{uiText("ui.we_receive_ip_address_and_request_logs_from__05d76da525")}</p>
      <h3>{uiText("ui.partner_information_8b1d78cff8")}</h3>
      <p>{uiText("ui.when_an_organization_connects_dealerspace_or_a7677b5e9b")}</p>

      <h2>{uiText("ui.3_sources_9e8d69d046")}</h2>
      <p>{uiText("ui.information_comes_from_you_other_participant_5aa8c07217")}</p>

      <h2>{uiText("ui.4_why_we_use_information_079c7764e2")}</h2>
      <ul>
        <li>{uiText("ui.authenticate_users_maintain_accounts_and_sec_964193fc2e")}</li>
        <li>{uiText("ui.decode_vehicles_conduct_inspections_store_ev_5076bfabfd")}</li>
        <li>{uiText("ui.connect_ios_to_a_supported_obd_adapter_and_i_9e0b5878ea")}</li>
        <li>{uiText("ui.operate_marketplace_community_messaging_revi_939a3d85f6")}</li>
        <li>{uiText("ui.process_payments_signatures_contracts_receip_d7d8ca1cc2")}</li>
        <li>{uiText("ui.generate_and_moderate_content_with_the_ai_pr_71449eca80")}</li>
        <li>{uiText("ui.provide_support_investigate_abuse_maintain_a_c615e4e0f0")}</li>
        <li>{uiText("ui.debug_maintain_and_improve_reliability_acces_fcdd94d93f")}</li>
      </ul>

      <h2>{uiText("ui.5_ai_processing_42f0099805")}</h2>
      <p>{uiText("ui.perfectppi_sends_relevant_vehicle_vin_inspec_04b6a97d4d")}</p>
      <p>{uiText("ui.ai_output_can_be_incomplete_or_wrong_it_is_n_16d9315adb")}<Link href="/support">{uiText("ui.support_be91940b79")}</Link>{uiText("ui.see_the_c4787bbca7")}<Link href="/ai-disclosure">{uiText("ui.ai_processing_disclosure_09c3e9b771")}</Link>{uiText("ui.for_more_detail_fdd608aba3")}</p>

      <h2>{uiText("ui.6_when_information_is_disclosed_e9cf020d5f")}</h2>
      <p>{uiText("ui.we_disclose_information_as_needed_to_supabas_e30cdba900")}</p>
      <p>{uiText("ui.processor_practices_and_contract_terms_requi_9c4e390311")}</p>

      <h2>{uiText("ui.7_public_content_and_sharing_links_3fa5ab4a20")}</h2>
      <p>{uiText("ui.active_public_vehicle_listings_can_be_availa_b691de38f3")}</p>
      <h3>{uiText("ui.reports_moderation_and_moderator_access_ca92a179ed")}</h3>
      <p>{uiText("ui.a_valid_first_report_hides_a_post_or_comment_d7fa49d67c")}</p>
      <p>{uiText("ui.a_requester_may_privately_dispute_a_complete_6eea3b291b")}</p>

      <h2>{uiText("ui.8_cookies_analytics_sale_sharing_and_opt_out_4aaec6c664")}</h2>
      <p>{uiText("ui.perfectppi_uses_necessary_authentication_and_903699bb29")}</p>
      <p>{uiText("ui.you_can_disable_product_analytics_in_privacy_ce1632196a")}</p>
      <p>{uiText("ui.where_applicable_we_treat_a_recognized_globa_0e37f71a87")}<Link href="/privacy-choices">{uiText("ui.your_privacy_choices_001864d293")}</Link>.
      </p>

      <h2>{uiText("ui.9_retention_and_deletion_3f9c49a8d7")}</h2>
      <p>{uiText("ui.we_keep_each_category_only_as_long_as_reason_3257e84f38")}</p>

      <h2>{uiText("ui.10_security_67a39824d2")}</h2>
      <p>{uiText("ui.we_use_measures_intended_to_protect_informat_1a103a57a5")}</p>

      <h2>{uiText("ui.11_your_choices_and_privacy_rights_5337fd56e6")}</h2>
      <p>{uiText("ui.depending_on_where_you_live_and_whether_a_la_80e5677b7a")}</p>
      <p>{uiText("ui.submit_and_track_requests_through_f2654bc486")}<Link href="/privacy-choices">{uiText("ui.your_privacy_choices_001864d293")}</Link>{uiText("ui.or_email_us_we_will_verify_requests_proporti_8ebc7049c3")}</p>

      <h2>{uiText("ui.12_google_api_data_03b347dd4e")}</h2>
      <p>{uiText("ui.perfectppi_uses_google_identity_data_only_to_9c46673ca5")}</p>

      <h2>{uiText("ui.13_children_8530127c80")}</h2>
      <p>{uiText("ui.perfectppi_is_not_directed_to_children_under_9483fb5623")}</p>

      <h2>{uiText("ui.14_u_s_operation_and_updates_5b9b80dae8")}</h2>
      <p>{uiText("ui.perfectppi_is_intended_for_the_united_states_38ce6d3f04")}</p>
    </LegalDocument>
  );
}
