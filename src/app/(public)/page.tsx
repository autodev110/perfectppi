import Link from "next/link";
import {
  ClipboardCheck,
  Shield,
  Users,
  UserCircle,
  Car,
  Search,
  BarChart3,
  BadgeCheck,
  Award,
  ArrowRight,
} from "lucide-react";

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative px-8 pt-24 pb-32 overflow-hidden bg-surface">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-16">
          <div className="flex-1 text-left z-10">
            <span className="inline-block px-4 py-1.5 mb-6 text-[10px] font-bold tracking-[0.1em] uppercase bg-secondary-container text-on-secondary-container rounded-full ghost-border">
              The New Standard in PPI
            </span>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-on-surface mb-6 leading-[1.05]">
              The Universal Standard for Verified{" "}
              <span className="text-on-tertiary-container">Vehicle Trust.</span>
            </h1>
            <p className="text-lg text-on-surface-variant max-w-lg mb-10 leading-relaxed">
              PerfectPPI brings institutional-grade transparency to the
              automotive market. Every detail, every repair, every mile — verified
              by experts and backed by service contracts.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/signup"
                className="bg-primary text-primary-foreground px-8 py-4 rounded-xl font-heading font-bold text-base shadow-lg hover:shadow-xl transition-all"
              >
                Start an Inspection
              </Link>
              <Link
                href="/technicians"
                className="bg-surface-container-highest text-on-surface px-8 py-4 rounded-xl font-heading font-bold text-base hover:bg-surface-container-high transition-all"
              >
                Find a Technician
              </Link>
            </div>
          </div>
          <div className="flex-1 relative hidden md:block">
            <div className="relative w-full aspect-square rounded-[2rem] overflow-hidden shadow-2xl rotate-3 scale-105">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC9j71xmzgLKPwE9xS43XSEoDwRPBz2dHCXDRJHb2yOjcF2x9P4Yc-bBWXGfLyMHndVFOW4bkSLHNaVQ3Wnef4Zj2YBoXBAKwdwB61bCsqUkn6gJYRJ-z3U5sJnD8Kao0pNOeXPlN0iWPGyM_uxC-ZfK-MCqs41FF0EC1sCOZRLvMWgxuYm5XYL1gA3VhnUAgT90IoWSwvkt--NMV5d6ix9KyfchKgjT2_wIld5g5ctzcpeFdUstgXbDQjn-zdvhrw0rURXeVu5mQ"
                alt="Luxury vintage Porsche 911"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-primary-container/40 to-transparent" />
            </div>
            <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-tertiary-container/10 rounded-full blur-3xl" />
          </div>
        </div>
      </section>

      {/* Trust Strip */}
      <section className="tonal-shift py-12 px-8">
        <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-8 text-on-surface-variant">
          <div className="flex items-center gap-3">
            <Shield className="h-7 w-7" />
            <span className="font-heading font-extrabold tracking-tight text-lg uppercase">
              Standardized Inspections
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Users className="h-7 w-7" />
            <span className="font-heading font-extrabold tracking-tight text-lg uppercase">
              Verified Technicians
            </span>
          </div>
          <div className="flex items-center gap-3">
            <BadgeCheck className="h-7 w-7" />
            <span className="font-heading font-extrabold tracking-tight text-lg uppercase">
              Warranty-Backed Flow
            </span>
          </div>
        </div>
      </section>

      {/* Feature Blocks — Bento Style */}
      <section id="features" className="py-24 px-8 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Large Feature */}
            <div className="md:col-span-8 bg-surface-container-lowest p-10 rounded-[2rem] shadow-sm ghost-border flex flex-col justify-between min-h-[400px]">
              <div>
                <div className="w-12 h-12 bg-primary-container rounded-xl flex items-center justify-center text-white mb-6">
                  <ClipboardCheck className="h-6 w-6" />
                </div>
                <h3 className="text-3xl font-extrabold tracking-tighter mb-4">
                  Guided Inspections
                </h3>
                <p className="text-on-surface-variant max-w-md leading-relaxed">
                  Step-by-step mobile-first inspection workflow with direct
                  camera capture across 12 vehicle sections. No bolt left
                  unturned.
                </p>
              </div>
              <div className="mt-8 flex gap-4 overflow-hidden">
                <div className="h-40 w-1/2 rounded-xl bg-surface-container overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCJLfVE7sFdzOsBsPh5PWEwzC8_4PQvhWprEuiLZO9kaSMD-gbhKBmSBKKMcUZ5tsNN4jQs1p82AgNh3qu8tIuxmOJXcdjlI7L0KPwFeIlODQMXDwFArl2opEsyIJZJG_pjFOlDy7Sy0eyYzqp0aeiVe04tv7CfYZnSPBvGlp_oTimVhrZDQY9nzYlwEWjxSEegVytZ0SxZfEs9W99jTMa6Q_QmKppDvrlJu-F2bOMZD2GMGbpNe4m2dbAhlwECmDlOQ-ty9sn0WA"
                    alt="Technician inspecting engine"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="h-40 w-1/2 rounded-xl bg-surface-container overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuAgdtzjS5fTJaXGfw1qjCNxyg4TecV3hT-kQQsMGffHqQS7ZLjg8wos62s9qf8hYfwI7UikJM9vTW6WDqBM3tMzdLyTrpcwwNLBCSB1AqZH0DF6tLTC7DISi-6EyfL5kRE-Jr-XYHZqxMiUBzy_70ZdYJYQYPjRiu9wTCc6RYuUMR6_9yPuwtcOyO6G8vwOz0owXidWN3PZjIyconWA8l45oB4K2I6Yk3LVS6GTaA7Fhh5yfmaP9JFQN2KlyORhoYMsgDF1f6EXyg"
                    alt="Digital diagnostic dashboard"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>

            {/* Small Feature 1 — Dark */}
            <div
              id="warranty"
              className="md:col-span-4 bg-primary-container p-10 rounded-[2rem] shadow-sm text-white flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-white mb-6 backdrop-blur">
                  <Shield className="h-6 w-6" />
                </div>
                <h3 className="text-2xl font-extrabold tracking-tighter mb-4">
                  Service Contracts
                </h3>
                <p className="text-primary-fixed-dim leading-relaxed">
                  Beyond the inspection. Secure your asset with vehicle service
                  contracts, backed by tier-one providers.
                </p>
              </div>
              <Link
                href="/signup"
                className="mt-8 flex items-center gap-2 font-heading font-bold text-sm tracking-tight hover:gap-4 transition-all text-white"
              >
                View Coverage Options{" "}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Small Feature 2 */}
            <div className="md:col-span-4 bg-surface-container-lowest p-10 rounded-[2rem] shadow-sm ghost-border">
              <div className="w-12 h-12 bg-secondary-container rounded-xl flex items-center justify-center text-on-secondary-container mb-6">
                <BadgeCheck className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-extrabold tracking-tighter mb-4">
                Certified Network
              </h3>
              <p className="text-on-surface-variant mb-6">
                Only verified technicians pass our certification protocol.
              </p>
              <div className="space-y-3">
                {/* Trust Badges */}
                <div className="flex items-center gap-3 p-3 bg-surface rounded-xl ghost-border">
                  <div className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-amber-600">
                    <Award className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-heading font-extrabold text-amber-700 tracking-tight">
                    GOLD CERTIFIED
                  </span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-surface rounded-xl ghost-border">
                  <div className="w-8 h-8 rounded-full bg-slate-300/40 border border-slate-400/20 flex items-center justify-center text-slate-600">
                    <Award className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-heading font-extrabold text-slate-700 tracking-tight">
                    SILVER TECHNICIAN
                  </span>
                </div>
              </div>
            </div>

            {/* Small Feature 3 */}
            <div className="md:col-span-8 bg-surface-container-low p-10 rounded-[2rem] flex flex-col md:flex-row gap-10 items-center overflow-hidden">
              <div className="flex-1">
                <h3 className="text-3xl font-extrabold tracking-tighter mb-4">
                  Precision Reporting
                </h3>
                <p className="text-on-surface-variant leading-relaxed mb-6">
                  Detailed PDF reports with high-resolution imagery and
                  technician commentary delivered after inspection completion.
                </p>
              </div>
              <div className="flex-1 w-full bg-white rounded-xl shadow-xl p-4 transform translate-y-4 rotate-1">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-bold text-slate-400">
                    REPORT #9921-X
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded">
                    VERIFIED
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full mb-2" />
                <div className="h-2 w-3/4 bg-slate-100 rounded-full mb-4" />
                <div className="flex gap-2">
                  <div className="h-12 w-12 bg-slate-100 rounded" />
                  <div className="h-12 w-12 bg-slate-100 rounded" />
                  <div className="h-12 w-12 bg-slate-100 rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-8 bg-surface-container-low">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold tracking-tighter mb-4">
              How It Works
            </h2>
            <p className="text-on-surface-variant max-w-lg mx-auto">
              From profile setup to full coverage in five seamless steps.
            </p>
          </div>
          <div className="relative flex flex-col md:flex-row justify-between gap-8">
            <div className="hidden md:block absolute top-10 left-0 right-0 h-0.5 bg-outline-variant/30 -z-10" />

            {[
              { icon: UserCircle, label: "Profile", desc: "Create your account in seconds." },
              { icon: Car, label: "Add Vehicle", desc: "Enter your VIN and vehicle details." },
              { icon: Search, label: "Inspection", desc: "Self-perform or assign a technician." },
              { icon: BarChart3, label: "Results", desc: "Receive your detailed inspection report." },
              { icon: BadgeCheck, label: "Coverage", desc: "Activate warranty-backed service contracts." },
            ].map((step, i) => (
              <div
                key={step.label}
                className="flex-1 flex flex-col items-center text-center group"
              >
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm ${
                    i === 2
                      ? "bg-primary-container shadow-lg"
                      : "bg-surface-container-lowest ghost-border"
                  }`}
                >
                  <step.icon
                    className={`h-8 w-8 ${
                      i === 2 ? "text-white" : "text-primary"
                    }`}
                  />
                </div>
                <h4 className="font-heading font-bold text-lg mb-2">
                  {step.label}
                </h4>
                <p className="text-xs text-on-surface-variant">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof / Credibility */}
      <section className="py-24 px-8 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-4xl font-extrabold tracking-tighter mb-8 leading-tight">
                Trust is the Only Currency that Matters.
              </h2>
              <div className="bg-surface-container-lowest p-8 rounded-2xl ghost-border shadow-sm">
                <p className="text-lg italic text-on-surface-variant mb-6">
                  &ldquo;PerfectPPI changed how we source inventory. The reports
                  are so detailed, we feel comfortable buying sight-unseen from
                  across the country.&rdquo;
                </p>
                <div className="flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCfGo8LSFZRopRJU7KJIAENifIAcp5BBTNRW85sijzOtAHE_Pyl4x8OtPAey9-CDCQpb9SxoiS9LgB52ZWtuQ6g5yK4h92_quJxLy_EEF9Evey5TPcy1ifuSDbfcSZNE3PGGUXwLPR4RxTJ7X-vqKforwgYQD1truD77gUb84zCTc49HUOz2gsagakfSAPob05Ng4c6X5Sbl9cJSra5tUpqMT9gaXnb8jfwHrWWXsBxAStDDAH6SXh3dDEBDf10nUkWXUslpo5aZQ"
                    alt="James R. Sterling"
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  <div>
                    <p className="font-heading font-bold text-sm">
                      James R. Sterling
                    </p>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                      Sterling Automotive Group
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-container p-8 rounded-3xl text-center flex flex-col justify-center min-h-[180px]">
                <p className="text-4xl font-black text-primary mb-2">15k+</p>
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                  Inspections Done
                </p>
              </div>
              <div className="bg-primary-container p-8 rounded-3xl text-center flex flex-col justify-center min-h-[180px]">
                <p className="text-4xl font-black text-white mb-2">99.8%</p>
                <p className="text-xs font-bold text-primary-fixed-dim uppercase tracking-widest">
                  Accuracy Rate
                </p>
              </div>
              <div className="bg-surface-container-highest p-8 rounded-3xl text-center flex flex-col justify-center min-h-[180px]">
                <p className="text-4xl font-black text-primary mb-2">240+</p>
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                  Technician Hubs
                </p>
              </div>
              <div className="bg-surface-container-low p-8 rounded-3xl text-center flex flex-col justify-center min-h-[180px] ghost-border">
                <p className="text-4xl font-black text-primary mb-2">$0</p>
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                  Hidden Fees
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-8 pb-24">
        <div className="max-w-7xl mx-auto bg-primary-container rounded-[3rem] p-16 text-center text-white relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tighter mb-6">
              Ready to secure your next asset?
            </h2>
            <p className="text-primary-fixed-dim max-w-xl mx-auto mb-10 text-lg">
              Join the network of collectors, dealers, and technicians using the
              new standard of vehicle trust.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/signup"
                className="bg-white text-primary px-10 py-5 rounded-2xl font-heading font-extrabold text-lg shadow-xl hover:scale-105 transition-all"
              >
                Get Started Now
              </Link>
              <Link
                href="/technicians"
                className="bg-white/10 backdrop-blur text-white px-10 py-5 rounded-2xl font-heading font-extrabold text-lg ghost-border hover:bg-white/20 transition-all"
              >
                Find a Technician
              </Link>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-on-tertiary-container/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
        </div>
      </section>
    </>
  );
}
