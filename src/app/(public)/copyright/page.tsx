import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN, LEGAL_CONTACT_EMAIL } from "@/lib/legal/constants";
import { t as uiText } from "@/lib/i18n";

export const metadata: Metadata = {
  title: uiText("ui.copyright_complaints_8d9566d40f"),
  description: uiText("ui.how_to_report_alleged_copyright_infringement_c5217459ef"),
  alternates: { canonical: `${CANONICAL_ORIGIN}/copyright` },
};

export default function CopyrightPage() {
  return (
    <LegalDocument title={uiText("ui.copyright_complaints_8d9566d40f")} description={uiText("ui.a_channel_for_reporting_content_you_believe__2c6a472f6e")}>
      <h2>{uiText("ui.submit_a_notice_d9fbc2afe3")}</h2>
      <p>{uiText("ui.email_009557a4da")}<a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=Copyright%20complaint`}>{LEGAL_CONTACT_EMAIL}</a>{uiText("ui.with_your_contact_information_identification_4e096f817a")}</p>

      <h2>{uiText("ui.response_and_counter_notices_f1a5291cc1")}</h2>
      <p>{uiText("ui.we_may_remove_or_restrict_material_while_rev_6d20f1d974")}</p>

      <h2>{uiText("ui.dmca_status_7b9c3018de")}</h2>
      <p>{uiText("ui.perfectppi_has_not_yet_published_a_designate_c46ea05ac3")}</p>
    </LegalDocument>
  );
}
