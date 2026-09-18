import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { CANONICAL_ORIGIN } from "@/lib/legal/constants";
import { t as uiText } from "@/lib/i18n";

export const metadata: Metadata = {
  title: uiText("ui.service_contract_disclosure_11ca5ba22d"),
  description: uiText("ui.important_information_about_perfectppi_vehic_8ed0c6a66e"),
  alternates: { canonical: `${CANONICAL_ORIGIN}/warranty-disclosure` },
};

export default function WarrantyDisclosurePage() {
  return (
    <LegalDocument title={uiText("ui.service_contract_disclosure_11ca5ba22d")} description={uiText("ui.important_limitations_while_vehicle_service__c6b6a28553")}>
      <h2>{uiText("ui.no_coverage_from_a_preview_660c60d339")}</h2>
      <p>{uiText("ui.an_inspection_report_ai_generated_eligibilit_da0bcf45a0")}</p>

      <h2>{uiText("ui.the_issued_contract_controls_fe61d36c8c")}</h2>
      <p>{uiText("ui.the_provider_or_obligor_administrator_covere_75072670d4")}</p>

      <h2>{uiText("ui.launch_limitation_10ce5fb1c6")}</h2>
      <p>{uiText("ui.perfectppi_s_role_compensation_licenses_regi_61e46ca7a0")}</p>
    </LegalDocument>
  );
}
