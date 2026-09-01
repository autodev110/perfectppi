import Link from "next/link";

export function Footer() {
  return (
    <footer className="tonal-shift pt-24 pb-12 px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div>
            <div className="text-2xl font-black tracking-tighter text-slate-900 mb-6">
              PerfectPPI
            </div>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Guided vehicle inspections, diagnostic context, and structured
              reports for clearer decisions.
            </p>
          </div>

          <div>
            <h5 className="text-sm font-extrabold uppercase tracking-widest mb-6 text-on-surface">
              Product
            </h5>
            <ul className="space-y-4 text-sm text-on-surface-variant font-medium">
              <li>
                <Link href="/#features" className="hover:text-primary transition-colors">
                  Guided Inspections
                </Link>
              </li>
              <li>
                <Link href="/#warranty" className="hover:text-primary transition-colors">
                  Service Contracts
                </Link>
              </li>
              <li>
                <Link href="/technicians" className="hover:text-primary transition-colors">
                  Technician Network
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="text-sm font-extrabold uppercase tracking-widest mb-6 text-on-surface">
              Company
            </h5>
            <ul className="space-y-4 text-sm text-on-surface-variant font-medium">
              <li>
                <Link href="/support" className="hover:text-primary transition-colors">
                  Contact &amp; Support
                </Link>
              </li>
              <li>
                <Link href="/accessibility" className="hover:text-primary transition-colors">
                  Accessibility
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h5 className="text-sm font-extrabold uppercase tracking-widest mb-6 text-on-surface">
              Legal
            </h5>
            <ul className="space-y-4 text-sm text-on-surface-variant font-medium">
              <li>
                <Link href="/privacy" className="hover:text-primary transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-primary transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy-choices" className="hover:text-primary transition-colors">
                  Your Privacy Choices
                </Link>
              </li>
              <li>
                <Link href="/notice-at-collection" className="hover:text-primary transition-colors">
                  Notice at Collection
                </Link>
              </li>
              <li>
                <Link href="/warranty-disclosure" className="hover:text-primary transition-colors">
                  Service Contract Disclosure
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-outline-variant/20 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-on-surface-variant font-medium">
            &copy; {new Date().getFullYear()} PerfectPPI. All rights reserved.
          </p>
          <p className="text-center text-xs text-on-surface-variant md:text-right">
            PerfectPPI is a product managed by DnD Solutions &amp; Optimization LLC.
          </p>
        </div>
      </div>
    </footer>
  );
}
