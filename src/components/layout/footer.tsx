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
              The universal standard for verified vehicle trust. Precision,
              transparency, and protection in every report.
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
                <Link href="#" className="hover:text-primary transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-primary transition-colors">
                  Technician Careers
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
                <Link href="#" className="hover:text-primary transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-primary transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-primary transition-colors">
                  Warranty Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-outline-variant/20 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-on-surface-variant font-medium">
            &copy; {new Date().getFullYear()} PerfectPPI. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
