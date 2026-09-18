import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN, LEGAL_CONTACT_EMAIL } from "@/lib/legal/constants";
import { t as uiText } from "@/lib/i18n";

export const metadata: Metadata = {
  title: uiText("ui.accessibility_statement_78d4fc94c0"),
  description: uiText("ui.perfectppi_accessibility_goals_and_feedback__9b367693e2"),
  alternates: { canonical: `${CANONICAL_ORIGIN}/accessibility` },
};

export default function AccessibilityPage() {
  return (
    <LegalDocument title={uiText("ui.accessibility_statement_78d4fc94c0")} description={uiText("ui.perfectppi_is_working_toward_an_accessible_w_548331b7c4")}>
      <h2>{uiText("ui.our_goal_ec8ab535fa")}</h2>
      <p>{uiText("ui.perfectppi_uses_wcag_2_2_level_aa_as_an_engi_7714ac8396")}</p>

      <h2>{uiText("ui.current_work_77b61a7a9b")}</h2>
      <p>{uiText("ui.work_includes_semantic_headings_and_controls_799498ed52")}</p>

      <h2>{uiText("ui.request_assistance_98cea0ccbe")}</h2>
      <p>{uiText("ui.email_009557a4da")}<a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=PerfectPPI%20accessibility`}>{LEGAL_CONTACT_EMAIL}</a>{uiText("ui.with_the_page_or_screen_device_browser_or_ap_07edb754c5")}</p>
    </LegalDocument>
  );
}

