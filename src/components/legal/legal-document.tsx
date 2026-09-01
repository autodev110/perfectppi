import Link from "next/link";
import {
  COMPANY_NOTICE,
  LEGAL_CONTACT_EMAIL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
  LEGAL_VERSION,
} from "@/lib/legal/constants";

const legalLinks = [
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Privacy Choices", "/privacy-choices"],
  ["Notice at Collection", "/notice-at-collection"],
  ["Community Guidelines", "/community-guidelines"],
  ["AI Disclosure", "/ai-disclosure"],
  ["Accessibility", "/accessibility"],
  ["Copyright", "/copyright"],
  ["Support", "/support"],
] as const;

export function LegalDocument({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto max-w-5xl px-6 py-16 md:px-8 md:py-24">
      <header className="mb-12 border-b border-outline-variant/30 pb-10">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-on-tertiary-container">
          Legal and trust center
        </p>
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight md:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-on-surface-variant">
          {description}
        </p>
        <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-2 text-sm text-on-surface-variant">
          <div><dt className="inline font-semibold text-on-surface">Effective: </dt><dd className="inline">{LEGAL_EFFECTIVE_DATE}</dd></div>
          <div><dt className="inline font-semibold text-on-surface">Updated: </dt><dd className="inline">{LEGAL_LAST_UPDATED}</dd></div>
          <div><dt className="inline font-semibold text-on-surface">Version: </dt><dd className="inline">{LEGAL_VERSION}</dd></div>
        </dl>
      </header>

      <div className="legal-copy">{children}</div>

      <footer className="mt-14 rounded-2xl bg-surface-container-low p-6 text-sm leading-6 text-on-surface-variant">
        <p className="font-semibold text-on-surface">{COMPANY_NOTICE}</p>
        <p className="mt-2">
          Questions may be sent to{" "}
          <a className="font-semibold text-on-tertiary-container underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>.
        </p>
        <nav aria-label="Legal documents" className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
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
