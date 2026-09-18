import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN, DISCLOSURES_LAST_UPDATED } from "@/lib/legal/constants";
import { t as uiText } from "@/lib/i18n";

export const metadata: Metadata = {
  title: uiText("ui.ai_processing_disclosure_09c3e9b771"),
  description: uiText("ui.how_perfectppi_uses_ai_for_reports_vin_readi_6f45ff6216"),
  alternates: { canonical: `${CANONICAL_ORIGIN}/ai-disclosure` },
};

export default function AiDisclosurePage() {
  return (
    <LegalDocument
      title={uiText("ui.ai_processing_disclosure_09c3e9b771")}
      description={uiText("ui.where_ai_is_used_what_information_it_receive_99c61b373c")}
      updated={DISCLOSURES_LAST_UPDATED}
      version="ai-disclosure-2026-09-10"
    >
      <h2>{uiText("ui.inspection_and_vin_features_84b93bf1dc")}</h2>
      <p>{uiText("ui.perfectppi_uses_google_gemini_2_5_flash_to_r_1d2a5b3094")}</p>

      <h2>{uiText("ui.community_moderation_8e2b4ca9f8")}</h2>
      <p>{uiText("ui.in_the_current_release_ordinary_community_te_afa5f90498")}<strong>{uiText("ui.not_254bb97b57")}</strong>{uiText("ui.sent_to_gemini_or_any_other_general_purpose__a229d38786")}</p>
      <p>{uiText("ui.moderation_decisions_on_reported_content_are_6b7e34eddc")}</p>

      <h2>{uiText("ui.important_limitations_1e4a7ad6ba")}</h2>
      <p>{uiText("ui.ai_can_misunderstand_images_diagnostic_data__a98a117f18")}</p>

      <h2>{uiText("ui.human_review_and_correction_b429fd359d")}</h2>
      <p>{uiText("ui.you_may_report_an_inaccurate_inspection_outp_cdbd371310")}</p>

      <h2>{uiText("ui.vendor_controls_e464b83d11")}</h2>
      <p>{uiText("ui.api_keys_remain_server_side_perfectppi_minim_b2ad47153c")}</p>
    </LegalDocument>
  );
}
