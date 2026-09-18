import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN } from "@/lib/legal/constants";
import { t as uiText } from "@/lib/i18n";

export const metadata: Metadata = {
  title: uiText("ui.notice_at_collection_6e0485e676"),
  description: uiText("ui.the_information_perfectppi_collects_and_why__24f4320792"),
  alternates: { canonical: `${CANONICAL_ORIGIN}/notice-at-collection` },
};

export default function NoticeAtCollectionPage() {
  return (
    <LegalDocument title={uiText("ui.notice_at_collection_6e0485e676")} description={uiText("ui.a_short_notice_about_the_information_collect_3ae22d289a")}>
      <h2>{uiText("ui.categories_collected_d4967fee5f")}</h2>
      <p>{uiText("ui.depending_on_the_features_you_use_we_collect_384c59fc75")}</p>

      <h2>{uiText("ui.purposes_8f654d6f37")}</h2>
      <p>{uiText("ui.we_use_this_information_to_authenticate_user_abfdb9a6ca")}<Link href="/ai-disclosure">{uiText("ui.ai_disclosure_80062905bb")}</Link>.</p>

      <h2>{uiText("ui.sale_sharing_and_retention_933b4d1e48")}</h2>
      <p>{uiText("ui.perfectppi_does_not_currently_sell_personal__74e6063007")}</p>

      <h2>{uiText("ui.your_choices_0ecda0421a")}</h2>
      <p>{uiText("ui.see_the_5be2c43322")}<Link href="/privacy">{uiText("ui.privacy_policy_506ff39462")}</Link>{uiText("ui.for_complete_disclosures_and_use_4a55d9fb25")}<Link href="/privacy-choices">{uiText("ui.your_privacy_choices_001864d293")}</Link>{uiText("ui.to_request_access_correction_export_opt_out__bf0f6480a2")}</p>
    </LegalDocument>
  );
}
