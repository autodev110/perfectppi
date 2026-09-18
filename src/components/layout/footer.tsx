import Link from "next/link";
import { t as uiText } from "@/lib/i18n";

export function Footer() {
  return (
    <footer className="tonal-shift pt-24 pb-12 px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div>
            <div className="text-2xl font-black tracking-tighter text-slate-900 mb-6">{uiText("ui.perfectppi_67127e136c")}</div>
            <p className="text-sm text-on-surface-variant leading-relaxed">{uiText("ui.guided_vehicle_inspections_diagnostic_contex_2bbf0ef823")}</p>
          </div>

          <div>
            <h5 className="text-sm font-extrabold uppercase tracking-widest mb-6 text-on-surface">{uiText("ui.product_fb9ef89417")}</h5>
            <ul className="space-y-4 text-sm text-on-surface-variant font-medium">
              <li>
                <Link href="/#features" className="hover:text-primary transition-colors">{uiText("ui.guided_inspections_5598fa1670")}</Link>
              </li>
              <li>
                <Link href="/#warranty" className="hover:text-primary transition-colors">{uiText("ui.service_contracts_969c387307")}</Link>
              </li>
              <li>
                <Link href="/technicians" className="hover:text-primary transition-colors">{uiText("ui.technician_network_266709ec68")}</Link>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="text-sm font-extrabold uppercase tracking-widest mb-6 text-on-surface">{uiText("ui.company_de4743c879")}</h5>
            <ul className="space-y-4 text-sm text-on-surface-variant font-medium">
              <li>
                <Link href="/support" className="hover:text-primary transition-colors">{uiText("ui.contact_support_aea69e9d76")}</Link>
              </li>
              <li>
                <Link href="/accessibility" className="hover:text-primary transition-colors">{uiText("ui.accessibility_d3368cbffe")}</Link>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="text-sm font-extrabold uppercase tracking-widest mb-6 text-on-surface">{uiText("ui.legal_4787eaf7c9")}</h5>
            <ul className="space-y-4 text-sm text-on-surface-variant font-medium">
              <li>
                <Link href="/privacy" className="hover:text-primary transition-colors">{uiText("ui.privacy_policy_506ff39462")}</Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-primary transition-colors">{uiText("ui.terms_of_service_4afa55bf7a")}</Link>
              </li>
              <li>
                <Link href="/privacy-choices" className="hover:text-primary transition-colors">{uiText("ui.your_privacy_choices_001864d293")}</Link>
              </li>
              <li>
                <Link href="/notice-at-collection" className="hover:text-primary transition-colors">{uiText("ui.notice_at_collection_6e0485e676")}</Link>
              </li>
              <li>
                <Link href="/warranty-disclosure" className="hover:text-primary transition-colors">{uiText("ui.service_contract_disclosure_11ca5ba22d")}</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-outline-variant/20 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-on-surface-variant font-medium">
            &copy; {new Date().getFullYear()}{uiText("ui.perfectppi_all_rights_reserved_7b9ebdc8cf")}</p>
          <p className="text-center text-xs text-on-surface-variant md:text-right">{uiText("ui.perfectppi_is_a_product_managed_by_dnd_solut_745a50eab5")}</p>
        </div>
      </div>
    </footer>
  );
}
