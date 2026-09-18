import Link from "next/link";
import {
  COMPANY_NOTICE,
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
  LEGAL_VERSION,
} from "@/lib/legal/constants";
import { t as uiText } from "@/lib/i18n";

const legalLinks = [
  [uiText("ui.privacy_54a57c3147"), "/privacy"],
  [uiText("ui.terms_ede5489964"), "/terms"],
  [uiText("ui.privacy_choices_174105e93f"), "/privacy-choices"],
  [uiText("ui.notice_at_collection_6e0485e676"), "/notice-at-collection"],
  [uiText("ui.community_guidelines_5e0f74c160"), "/community-guidelines"],
  [uiText("ui.ai_disclosure_80062905bb"), "/ai-disclosure"],
  [uiText("ui.accessibility_d3368cbffe"), "/accessibility"],
  [uiText("ui.copyright_8dfc77ab40"), "/copyright"],
  [uiText("ui.support_be91940b79"), "/support"],
] as const;

export function LegalDocument({
  title,
  description,
  updated = LEGAL_LAST_UPDATED,
  version = LEGAL_VERSION,
  children,
}: {
  title: string;
  description: string;
  /** Documents outside the Terms assent record carry their own revision date. */
  updated?: string;
  version?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-5xl px-6 py-16 md:px-8 md:py-24">
      <header className="mb-12 border-b border-outline-variant/30 pb-10">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-on-tertiary-container">{uiText("ui.legal_and_trust_center_e7dad7f845")}</p>
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight md:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-on-surface-variant">
          {description}
        </p>
        <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-2 text-sm text-on-surface-variant">
          <div><dt className="inline font-semibold text-on-surface">{uiText("ui.effective_0d30db04bf")}</dt><dd className="inline">{LEGAL_EFFECTIVE_DATE}</dd></div>
          <div><dt className="inline font-semibold text-on-surface">{uiText("ui.updated_4d42f9f47c")}</dt><dd className="inline">{updated}</dd></div>
          <div><dt className="inline font-semibold text-on-surface">{uiText("ui.version_74f20322a4")}</dt><dd className="inline">{version}</dd></div>
        </dl>
      </header>

      <div className="legal-copy">{children}</div>

      <footer className="mt-14 rounded-2xl bg-surface-container-low p-6 text-sm leading-6 text-on-surface-variant">
        <p className="font-semibold text-on-surface">{COMPANY_NOTICE}</p>
        <p className="mt-2">{uiText("ui.questions_may_be_sent_to_49e0465373")}{" "}
          <a className="font-semibold text-on-tertiary-container underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>.
        </p>
        <nav aria-label={uiText("ui.legal_documents_02881bb0fe")} className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
          {legalLinks.map(([label, href]) => (
            <Link key={href} href={href} className="font-semibold text-on-surface underline-offset-4 hover:underline">
              {label}
            </Link>
          ))}
        </nav>
      </footer>
    </article>
  );
}
