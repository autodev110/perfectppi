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
  Check,
  Gauge,
  MapPin,
  Tag,
} from "lucide-react";
import { getMarketplaceListings } from "@/features/marketplace/queries";
import { formatCurrency, formatMileage } from "@/lib/utils/formatting";

export default async function HomePage() {
  const recentListings = await getMarketplaceListings();
  const featuredListings = recentListings.slice(0, 3);

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="relative px-8 pt-20 pb-28 overflow-hidden bg-surface">
        {/* subtle grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--on-surface)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--on-surface)) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-14 relative z-10">
          {/* Copy */}
          <div className="flex-1 text-left">
            <span className="inline-flex items-center gap-2 px-3 py-1 mb-6 text-[10px] font-bold tracking-[0.12em] uppercase bg-secondary-container text-on-secondary-container rounded-full ghost-border">
              <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container inline-block" />
              The New Standard in PPI
            </span>
            <h1 className="text-5xl md:text-[4.25rem] font-extrabold tracking-tighter text-on-surface mb-6 leading-[1.06]">
              The Universal Standard<br />
              for Verified{" "}
              <span className="text-on-tertiary-container">Vehicle Trust.</span>
            </h1>
            <p className="text-lg text-on-surface-variant max-w-lg mb-9 leading-relaxed">
              PerfectPPI brings institutional-grade transparency to the
              automotive market. Every detail, every repair, every mile —
              verified by experts and backed by service contracts.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/signup"
                className="bg-primary text-primary-foreground px-8 py-4 rounded-xl font-heading font-bold text-base shadow-md hover:shadow-lg hover:-translate-y-px transition-all"
              >
                Start an Inspection
              </Link>
              <Link
                href="/marketplace"
                className="bg-surface-container-highest text-on-surface px-8 py-4 rounded-xl font-heading font-bold text-base ghost-border hover:bg-surface-container-high transition-all"
              >
                Browse Marketplace
              </Link>
              <Link
                href="/technicians"
                className="px-8 py-4 rounded-xl font-heading font-bold text-base ghost-border text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-all"
              >
                Find a Technician
              </Link>
            </div>
          </div>

          {/* Hero image */}
          <div className="hidden md:block flex-shrink-0 w-[520px]">
            <div className="relative w-full aspect-[4/5] rounded-[1.75rem] overflow-hidden shadow-2xl rotate-2 scale-105">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1611821064430-0d40291d0f0b?auto=format&fit=crop&w=1080&q=80"
                alt="Porsche 911 GT3 on city street"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary-container/60 via-transparent to-transparent" />
              {/* floating badge */}
              <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg">
                <div className="w-8 h-8 rounded-lg bg-on-tertiary-container/10 flex items-center justify-center flex-shrink-0">
                  <BadgeCheck className="h-4 w-4 text-on-tertiary-container" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                    Gold Certified
                  </p>
                  <p className="text-xs font-bold text-on-surface">
                    Full inspection completed
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust Marquee ───────────────────────────────────────── */}
      <section className="tonal-shift py-5 border-y border-outline-variant/20 overflow-hidden">
        <div
          className="flex w-max"
          style={{ animation: "marquee 50s linear infinite" }}
        >
          {[...Array(4)].flatMap((_, set) =>
            [
              { Icon: ClipboardCheck, label: "Standardized Inspections" },
              { Icon: BadgeCheck,     label: "Verified Technicians" },
              { Icon: Shield,         label: "Vehicle Service Contracts" },
              { Icon: BarChart3,      label: "AI-Generated Reports" },
              { Icon: Award,          label: "Certified Tech Network" },
              { Icon: Users,          label: "12 Inspection Sections" },
            ].map(({ Icon, label }) => (
              <div
                key={`${set}-${label}`}
                className="flex items-center gap-3 px-10 border-r border-outline-variant/25 text-on-surface-variant"
              >
                <Icon className="h-4 w-4 flex-shrink-0 opacity-50" />
                <span className="font-heading font-extrabold tracking-[0.08em] text-xs uppercase whitespace-nowrap">
                  {label}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── Bento Features ──────────────────────────────────────── */}
      <section id="features" className="py-20 px-8 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">

            {/* ─ Guided Inspections (large) ─────────────────────── */}
            <div className="md:col-span-8 bg-surface-container-lowest rounded-[1.75rem] shadow-sm ghost-border overflow-hidden flex flex-col min-h-[400px]">
              {/* Top content */}
              <div className="p-8 flex gap-8 flex-1">
                {/* Left: copy */}
                <div className="flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-5">
                    <div className="w-11 h-11 bg-primary-container rounded-xl flex items-center justify-center">
                      <ClipboardCheck className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 bg-surface-container px-3 py-1 rounded-full">
                      12 Sections
                    </span>
                  </div>
                  <h3 className="text-2xl font-extrabold tracking-tighter mb-2">
                    Guided Inspections
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed mb-auto">
                    Step-by-step mobile-first workflow with direct camera
                    capture across 12 standardized vehicle sections.
                  </p>
                </div>

                {/* Right: step list panel */}
                <div className="hidden md:flex flex-col w-[200px] flex-shrink-0 bg-surface-container rounded-2xl p-4 gap-1.5">
                  {[
                    { label: "Exterior", done: true },
                    { label: "Engine Bay", done: true },
                    { label: "Interior", done: true },
                    { label: "Tires & Brakes", done: false, active: true },
                    { label: "Fluids", done: false },
                    { label: "Electrical", done: false },
                    { label: "Road Test", done: false },
                  ].map(({ label, done, active }) => (
                    <div
                      key={label}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all ${
                        active
                          ? "bg-primary-container/10 ghost-border"
                          : "opacity-60"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                          done
                            ? "bg-teal"
                            : active
                            ? "bg-on-tertiary-container/20 ghost-border"
                            : "bg-surface-container-high"
                        }`}
                      >
                        {done && <Check className="h-2.5 w-2.5 text-white" />}
                        {active && <div className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container" />}
                      </div>
                      <span className={`text-xs font-bold ${active ? "text-on-surface" : "text-on-surface-variant"}`}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom: product moment strip */}
              <div className="flex gap-3 px-8 pb-8">
                {/* Wide cell — technician in action */}
                <div className="relative flex-[3] h-40 rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCJLfVE7sFdzOsBsPh5PWEwzC8_4PQvhWprEuiLZO9kaSMD-gbhKBmSBKKMcUZ5tsNN4jQs1p82AgNh3qu8tIuxmOJXcdjlI7L0KPwFeIlODQMXDwFArl2opEsyIJZJG_pjFOlDy7Sy0eyYzqp0aeiVe04tv7CfYZnSPBvGlp_oTimVhrZDQY9nzYlwEWjxSEegVytZ0SxZfEs9W99jTMa6Q_QmKppDvrlJu-F2bOMZD2GMGbpNe4m2dbAhlwECmDlOQ-ty9sn0WA"
                    alt="Technician inspecting engine"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-teal animate-pulse" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">
                      Section 4 · Tires & Brakes
                    </span>
                  </div>
                </div>

                {/* Narrow cell — dashboard readout */}
                <div className="relative flex-[2] h-40 rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuAgdtzjS5fTJaXGfw1qjCNxyg4TecV3hT-kQQsMGffHqQS7ZLjg8wos62s9qf8hYfwI7UikJM9vTW6WDqBM3tMzdLyTrpcwwNLBCSB1AqZH0DF6tLTC7DISi-6EyfL5kRE-Jr-XYHZqxMiUBzy_70ZdYJYQYPjRiu9wTCc6RYuUMR6_9yPuwtcOyO6G8vwOz0owXidWN3PZjIyconWA8l45oB4K2I6Yk3LVS6GTaA7Fhh5yfmaP9JFQN2KlyORhoYMsgDF1f6EXyg"
                    alt="Digital diagnostic dashboard"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary-container/70 via-transparent to-transparent" />
                  <div className="absolute top-3 right-3 bg-white/15 backdrop-blur-sm rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container" />
                    <span className="text-[9px] font-black text-white uppercase tracking-wider">
                      AI Analysis
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3">
                    <div className="h-1 w-full bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full w-[67%] bg-teal rounded-full" />
                    </div>
                    <p className="text-[9px] text-white/60 mt-1 font-bold">8 / 12 sections complete</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ─ Service Contracts (dark) ───────────────────────── */}
            <div
              id="warranty"
              className="md:col-span-4 bg-primary-container rounded-[1.75rem] shadow-sm text-white flex flex-col justify-between overflow-hidden relative"
            >
              {/* decorative rings */}
              <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full border border-white/5" />
              <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full border border-white/5" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-on-tertiary-container/5 rounded-full translate-y-1/3 -translate-x-1/3 blur-2xl" />

              <div className="p-8 relative z-10">
                <div className="w-11 h-11 bg-white/10 rounded-xl flex items-center justify-center mb-5 backdrop-blur">
                  <Shield className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-xl font-extrabold tracking-tighter mb-2">
                  Service Contracts
                </h3>
                <p className="text-sm text-primary-fixed-dim leading-relaxed mb-7">
                  Beyond the inspection. Secure your asset with vehicle service
                  contracts backed by tier-one providers.
                </p>

                {/* Tier table */}
                <div className="space-y-0 rounded-2xl overflow-hidden ghost-border">
                  {[
                    {
                      tier: "Bronze", abbr: "BR",
                      color: "text-amber-300", bg: "bg-amber-400/8",
                      items: ["Powertrain", "Engine"],
                    },
                    {
                      tier: "Silver", abbr: "SL",
                      color: "text-slate-300", bg: "bg-white/5",
                      items: ["+ Electrical", "+ AC"],
                    },
                    {
                      tier: "Gold", abbr: "GD",
                      color: "text-yellow-300", bg: "bg-yellow-400/8",
                      items: ["Full Coverage"],
                    },
                  ].map(({ tier, abbr, color, bg, items }, i) => (
                    <div
                      key={tier}
                      className={`${bg} px-4 py-3.5 flex items-center gap-3 ${i < 2 ? "border-b border-white/8" : ""}`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center flex-shrink-0">
                        <span className={`text-[10px] font-black ${color}`}>{abbr}</span>
                      </div>
                      <div className="flex-1">
                        <p className={`text-xs font-extrabold ${color}`}>{tier}</p>
                        <p className="text-[10px] text-white/40 mt-0.5">{items.join(" · ")}</p>
                      </div>
                      <Check className={`h-3.5 w-3.5 ${i === 2 ? color : "text-white/20"}`} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-8 pb-7 relative z-10">
                <Link
                  href="/signup"
                  className="flex items-center gap-2 font-heading font-bold text-sm tracking-tight hover:gap-3 transition-all text-white/70 hover:text-white"
                >
                  View Coverage Options
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* ─ Certified Network ──────────────────────────────── */}
            <div className="md:col-span-4 bg-surface-container-lowest p-8 rounded-[1.75rem] shadow-sm ghost-border">
              <div className="w-11 h-11 bg-secondary-container rounded-xl flex items-center justify-center text-on-secondary-container mb-5">
                <BadgeCheck className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-extrabold tracking-tighter mb-3">
                Certified Network
              </h3>
              <p className="text-sm text-on-surface-variant mb-5">
                Only verified technicians pass our certification protocol.
              </p>
              <div className="space-y-2.5">
                {[
                  { label: "Gold Certified", sublabel: "OEM Qualified", color: "text-amber-600", bg: "bg-amber-500/10 border-amber-500/20" },
                  { label: "Silver Technician", sublabel: "ASE Certified", color: "text-slate-600", bg: "bg-slate-300/30 border-slate-400/20" },
                  { label: "Bronze Inspector", sublabel: "General Tech", color: "text-orange-700", bg: "bg-orange-400/10 border-orange-400/20" },
                ].map(({ label, sublabel, color, bg }) => (
                  <div key={label} className={`flex items-center gap-3 p-3 bg-surface rounded-xl border ${bg}`}>
                    <div className={`w-7 h-7 rounded-lg ${bg} border flex items-center justify-center`}>
                      <Award className={`h-3.5 w-3.5 ${color}`} />
                    </div>
                    <div>
                      <p className={`text-xs font-extrabold tracking-tight ${color}`}>{label}</p>
                      <p className="text-[10px] text-on-surface-variant">{sublabel}</p>
                    </div>
                    <Check className={`h-3.5 w-3.5 ${color} ml-auto`} />
                  </div>
                ))}
              </div>
            </div>

            {/* ─ Precision Reporting ────────────────────────────── */}
            <div className="md:col-span-8 bg-surface-container-low p-8 rounded-[1.75rem] flex flex-col md:flex-row gap-8 items-center overflow-hidden">
              <div className="flex-1">
                <h3 className="text-2xl font-extrabold tracking-tighter mb-3">
                  Precision Reporting
                </h3>
                <p className="text-sm text-on-surface-variant leading-relaxed mb-5">
                  Detailed PDF reports with high-resolution imagery and
                  technician commentary delivered after completion.
                </p>
                <div className="flex gap-3">
                  {["PDF Export", "Shareable Link", "Media Package"].map((f) => (
                    <span key={f} className="text-[11px] font-bold px-3 py-1 rounded-full bg-surface ghost-border text-on-surface-variant">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex-shrink-0 w-48 bg-white rounded-xl shadow-lg p-4 transform rotate-1">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[9px] font-bold text-slate-400">REPORT #9921-X</span>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-bold rounded">
                    VERIFIED
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full mb-1.5" />
                <div className="h-1.5 w-3/4 bg-slate-100 rounded-full mb-3" />
                <div className="flex gap-1.5 mb-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-10 w-10 bg-slate-100 rounded" />
                  ))}
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full mb-1.5" />
                <div className="h-1.5 w-2/3 bg-slate-100 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Recent Marketplace Listings ─────────────────────────── */}
      {featuredListings.length > 0 && (
        <section className="py-20 px-8 bg-surface">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-10">
              <div>
                <h2 className="text-3xl font-extrabold tracking-tighter mb-2">
                  Vehicles for Sale
                </h2>
                <p className="text-sm text-on-surface-variant max-w-md">
                  Real listings from verified sellers with PPI inspection history attached.
                </p>
              </div>
              <Link
                href="/marketplace"
                className="flex items-center gap-1.5 text-sm font-bold text-on-tertiary-container hover:gap-3 transition-all"
              >
                Browse all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {featuredListings.map((listing) => {
                const vehicle = listing.vehicle;
                const media = vehicle?.vehicle_media?.find((m) => m.is_primary) ?? vehicle?.vehicle_media?.[0];
                const vehicleName = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || listing.title;
                return (
                  <Link
                    key={listing.id}
                    href={`/vehicle/${listing.vehicle_id}?tab=marketplace`}
                    className="group bg-surface-container-lowest rounded-[1.5rem] overflow-hidden ghost-border shadow-sm hover:shadow-xl transition-all"
                  >
                    <div className="relative h-48 bg-surface-container-low overflow-hidden">
                      {media ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={media.url} alt={vehicleName ?? ""} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <Car className="h-12 w-12 text-on-surface-variant/20" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-primary-container/60 via-transparent to-transparent" />
                      <div className="absolute bottom-3 right-3">
                        <span className="bg-white/90 text-primary text-sm font-black px-3 py-1 rounded-lg">
                          {formatCurrency(listing.asking_price_cents)}
                        </span>
                      </div>
                    </div>
                    <div className="p-5">
                      <p className="font-heading font-bold text-on-surface mb-2 truncate">{vehicleName || "Vehicle"}</p>
                      <div className="flex flex-wrap gap-2 text-[11px] font-bold text-on-surface-variant">
                        {vehicle?.mileage != null && (
                          <span className="flex items-center gap-1 px-2.5 py-1 bg-surface-container rounded-full ghost-border">
                            <Gauge className="h-3 w-3" />{formatMileage(vehicle.mileage)} mi
                          </span>
                        )}
                        {listing.location && (
                          <span className="flex items-center gap-1 px-2.5 py-1 bg-surface-container rounded-full ghost-border">
                            <MapPin className="h-3 w-3" />{listing.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1 px-2.5 py-1 bg-teal/10 rounded-full text-teal">
                          <Tag className="h-3 w-3" />PPI Listed
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── How It Works ────────────────────────────────────────── */}
      <section className="py-20 px-8 bg-surface-container-low">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-extrabold tracking-tighter mb-3">
              How It Works
            </h2>
            <p className="text-sm text-on-surface-variant max-w-md mx-auto">
              From profile setup to full coverage in five seamless steps.
            </p>
          </div>
          <div className="relative flex flex-col md:flex-row justify-between gap-6">
            <div className="hidden md:block absolute top-9 left-0 right-0 h-px bg-outline-variant/30 -z-10" />
            {[
              { icon: UserCircle, label: "Profile", desc: "Create your account in seconds." },
              { icon: Car, label: "Add Vehicle", desc: "Enter your VIN and vehicle details." },
              { icon: Search, label: "Inspection", desc: "Self-perform or assign a technician." },
              { icon: BarChart3, label: "Results", desc: "Receive your detailed inspection report." },
              { icon: BadgeCheck, label: "Coverage", desc: "Activate warranty-backed service contracts." },
            ].map((step, i) => (
              <div key={step.label} className="flex-1 flex flex-col items-center text-center group">
                <div
                  className={`w-18 h-18 rounded-full flex items-center justify-center mb-5 group-hover:scale-110 transition-transform shadow-sm ${
                    i === 2
                      ? "bg-primary-container shadow-md"
                      : "bg-surface-container-lowest ghost-border"
                  }`}
                  style={{ width: "4.5rem", height: "4.5rem" }}
                >
                  <step.icon className={`h-6 w-6 ${i === 2 ? "text-white" : "text-primary"}`} />
                </div>
                <h4 className="font-heading font-bold text-sm mb-1.5">{step.label}</h4>
                <p className="text-xs text-on-surface-variant">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social Proof ────────────────────────────────────────── */}
      <section className="py-20 px-8 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tighter mb-7 leading-tight">
                Trust is the Only Currency that Matters.
              </h2>
              <div className="bg-surface-container-lowest p-7 rounded-2xl ghost-border shadow-sm">
                <p className="text-base italic text-on-surface-variant mb-5">
                  &ldquo;PerfectPPI changed how we source inventory. The reports
                  are so detailed, we feel comfortable buying sight-unseen from
                  across the country.&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCfGo8LSFZRopRJU7KJIAENifIAcp5BBTNRW85sijzOtAHE_Pyl4x8OtPAey9-CDCQpb9SxoiS9LgB52ZWtuQ6g5yK4h92_quJxLy_EEF9Evey5TPcy1ifuSDbfcSZNE3PGGUXwLPR4RxTJ7X-vqKforwgYQD1truD77gUb84zCTc49HUOz2gsagakfSAPob05Ng4c6X5Sbl9cJSra5tUpqMT9gaXnb8jfwHrWWXsBxAStDDAH6SXh3dDEBDf10nUkWXUslpo5aZQ"
                    alt="James R. Sterling"
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div>
                    <p className="font-heading font-bold text-sm">James R. Sterling</p>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                      Sterling Automotive Group
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { stat: "15k+", label: "Inspections Done", dark: false },
                { stat: "99.8%", label: "Accuracy Rate", dark: true },
                { stat: "240+", label: "Technician Hubs", dark: false, dimBg: true },
                { stat: "$0", label: "Hidden Fees", dark: false },
              ].map(({ stat, label, dark, dimBg }) => (
                <div
                  key={label}
                  className={`p-7 rounded-2xl text-center flex flex-col justify-center min-h-[160px] ${
                    dark
                      ? "bg-primary-container text-white"
                      : dimBg
                      ? "bg-surface-container-highest"
                      : "bg-surface-container"
                  } ${!dark ? "ghost-border" : ""}`}
                >
                  <p className={`text-3xl font-black mb-1.5 ${dark ? "text-white" : "text-primary"}`}>
                    {stat}
                  </p>
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? "text-primary-fixed-dim" : "text-on-surface-variant"}`}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <section className="px-8 pb-20">
        <div className="max-w-7xl mx-auto bg-primary-container rounded-[2.5rem] p-14 text-center text-white relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tighter mb-5">
              Ready to secure your next asset?
            </h2>
            <p className="text-primary-fixed-dim max-w-lg mx-auto mb-8 text-base">
              Join the network of collectors, dealers, and technicians using the
              new standard of vehicle trust.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/signup"
                className="bg-white text-primary px-9 py-4 rounded-xl font-heading font-extrabold text-base shadow-lg hover:scale-105 transition-all"
              >
                Get Started Now
              </Link>
              <Link
                href="/technicians"
                className="bg-white/10 backdrop-blur text-white px-9 py-4 rounded-xl font-heading font-extrabold text-base ghost-border hover:bg-white/20 transition-all"
              >
                Find a Technician
              </Link>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-on-tertiary-container/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
        </div>
      </section>
    </>
  );
}
