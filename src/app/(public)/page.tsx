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

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function HomePage() {
  const uiText = await getRequestTranslator();
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
              uiText("ui.linear_gradient_hsl_var_on_surface_1px_trans_0c09e6daea"),
            backgroundSize: "40px 40px",
          }}
        />

        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-14 relative z-10">
          {/* Copy */}
          <div className="flex-1 text-left">
            <span className="inline-flex items-center gap-2 px-3 py-1 mb-6 text-[10px] font-bold tracking-[0.12em] uppercase bg-secondary-container text-on-secondary-container rounded-full ghost-border">
              <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container inline-block" />{uiText("ui.guided_vehicle_inspection_platform_59c1b6ac7b")}</span>
            <h1 className="text-5xl md:text-[4.25rem] font-extrabold tracking-tighter text-on-surface mb-6 leading-[1.06]">{uiText("ui.vehicle_details_a43c33e24d")}<br />{uiText("ui.inspection_evidence_and_3af77c4fc0")}{" "}
              <span className="text-on-tertiary-container">{uiText("ui.diagnostic_context_8d664fb861")}</span>
            </h1>
            <p className="text-lg text-on-surface-variant max-w-lg mb-9 leading-relaxed">{uiText("ui.perfectppi_guides_vehicle_inspections_captur_09e4157672")}</p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/signup"
                className="bg-primary text-primary-foreground px-8 py-4 rounded-xl font-heading font-bold text-base shadow-md hover:shadow-lg hover:-translate-y-px transition-all"
              >{uiText("ui.start_an_inspection_657f4dfa60")}</Link>
              <Link
                href="/marketplace"
                className="bg-surface-container-highest text-on-surface px-8 py-4 rounded-xl font-heading font-bold text-base ghost-border hover:bg-surface-container-high transition-all"
              >{uiText("ui.browse_marketplace_d319099fe0")}</Link>
              <Link
                href="/technicians"
                className="px-8 py-4 rounded-xl font-heading font-bold text-base ghost-border text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-all"
              >{uiText("ui.find_a_technician_8f8aff766b")}</Link>
            </div>
          </div>

          {/* Hero image */}
          <div className="hidden md:block flex-shrink-0 w-[520px]">
            <div className="relative w-full aspect-[4/5] rounded-[1.75rem] overflow-hidden shadow-2xl rotate-2 scale-105">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1611821064430-0d40291d0f0b?auto=format&fit=crop&w=1080&q=80"
                alt={uiText("ui.porsche_911_gt3_on_city_street_dd13d5b0ec")}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary-container/60 via-transparent to-transparent" />
              {/* floating badge */}
              <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg">
                <div className="w-8 h-8 rounded-lg bg-on-tertiary-container/10 flex items-center justify-center flex-shrink-0">
                  <BadgeCheck className="h-4 w-4 text-on-tertiary-container" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{uiText("ui.inspection_record_2c5e1e9f65")}</p>
                  <p className="text-xs font-bold text-on-surface">{uiText("ui.full_inspection_completed_f04dbafa9e")}</p>
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
          aria-hidden="true"
          style={{ animation: uiText("ui.marquee_50s_linear_infinite_a760c3a4f0") }}
        >
          {[...Array(4)].flatMap((_, set) =>
            [
              { Icon: ClipboardCheck, label: uiText("ui.standardized_inspections_5472347fcf") },
              { Icon: BadgeCheck,     label: uiText("ui.technician_directory_5143ce2890") },
              { Icon: Shield,         label: uiText("ui.private_report_access_366464a057") },
              { Icon: BarChart3,      label: uiText("ui.structured_reports_431ded7e5a") },
              { Icon: Award,          label: uiText("ui.obd_diagnostic_context_47ba4063df") },
              { Icon: Users,          label: uiText("ui.12_inspection_sections_a303cf0c45") },
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
                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 bg-surface-container px-3 py-1 rounded-full">{uiText("ui.12_sections_6ea4f1f209")}</span>
                  </div>
                  <h3 className="text-2xl font-extrabold tracking-tighter mb-2">{uiText("ui.guided_inspections_5598fa1670")}</h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed mb-auto">{uiText("ui.step_by_step_mobile_first_workflow_with_dire_ce4d19326e")}</p>
                </div>

                {/* Right: step list panel */}
                <div className="hidden md:flex flex-col w-[200px] flex-shrink-0 bg-surface-container rounded-2xl p-4 gap-1.5">
                  {[
                    { label: uiText("ui.exterior_cd41a1f4fd"), done: true },
                    { label: uiText("ui.engine_bay_a1493e5309"), done: true },
                    { label: uiText("ui.interior_25b5c8ed56"), done: true },
                    { label: uiText("ui.tires_brakes_c7d10e5b9c"), done: false, active: true },
                    { label: uiText("ui.fluids_aec479d376"), done: false },
                    { label: uiText("ui.electrical_a2eefbcb6b"), done: false },
                    { label: uiText("ui.road_test_1e7a94739e"), done: false },
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
                    alt={uiText("ui.technician_inspecting_engine_47ef277ff7")}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-teal animate-pulse" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">{uiText("ui.section_4_tires_brakes_2c2f6c1726")}</span>
                  </div>
                </div>

                {/* Narrow cell — dashboard readout */}
                <div className="relative flex-[2] h-40 rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuAgdtzjS5fTJaXGfw1qjCNxyg4TecV3hT-kQQsMGffHqQS7ZLjg8wos62s9qf8hYfwI7UikJM9vTW6WDqBM3tMzdLyTrpcwwNLBCSB1AqZH0DF6tLTC7DISi-6EyfL5kRE-Jr-XYHZqxMiUBzy_70ZdYJYQYPjRiu9wTCc6RYuUMR6_9yPuwtcOyO6G8vwOz0owXidWN3PZjIyconWA8l45oB4K2I6Yk3LVS6GTaA7Fhh5yfmaP9JFQN2KlyORhoYMsgDF1f6EXyg"
                    alt={uiText("ui.digital_diagnostic_dashboard_41b0c862a2")}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary-container/70 via-transparent to-transparent" />
                  <div className="absolute top-3 right-3 bg-white/15 backdrop-blur-sm rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container" />
                    <span className="text-[9px] font-black text-white uppercase tracking-wider">{uiText("ui.ai_analysis_c8438a13b9")}</span>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3">
                    <div className="h-1 w-full bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full w-[67%] bg-teal rounded-full" />
                    </div>
                    <p className="text-[9px] text-white/60 mt-1 font-bold">{uiText("ui.8_12_sections_complete_016a1eb428")}</p>
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
                <h3 className="text-xl font-extrabold tracking-tighter mb-2">{uiText("ui.service_contracts_969c387307")}</h3>
                <p className="text-sm text-primary-fixed-dim leading-relaxed mb-7">{uiText("ui.where_legally_available_users_may_review_ser_75ff948d85")}</p>

                {/* Tier table */}
                <div className="space-y-0 rounded-2xl overflow-hidden ghost-border">
                  {[
                    {
                      tier: uiText("ui.bronze_d916515d82"), abbr: "BR",
                      color: "text-amber-300", bg: "bg-amber-400/8",
                      items: [uiText("ui.powertrain_6e70063b0a"), uiText("ui.engine_8e75ebbdb2")],
                    },
                    {
                      tier: uiText("ui.silver_a0b43df06f"), abbr: "SL",
                      color: "text-slate-300", bg: "bg-white/5",
                      items: ["+ Electrical", "+ AC"],
                    },
                    {
                      tier: uiText("ui.gold_6249df4367"), abbr: "GD",
                      color: "text-yellow-300", bg: "bg-yellow-400/8",
                      items: [uiText("ui.full_coverage_d0e25ab82b")],
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
                  href="/warranty-disclosure"
                  className="flex items-center gap-2 font-heading font-bold text-sm tracking-tight hover:gap-3 transition-all text-white/70 hover:text-white"
                >{uiText("ui.read_important_disclosures_01b695a166")}<ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* ─ Technician directory ───────────────────────────── */}
            <div className="md:col-span-4 bg-surface-container-lowest p-8 rounded-[1.75rem] shadow-sm ghost-border">
              <div className="w-11 h-11 bg-secondary-container rounded-xl flex items-center justify-center text-on-secondary-container mb-5">
                <BadgeCheck className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-extrabold tracking-tighter mb-3">{uiText("ui.technician_directory_5143ce2890")}</h3>
              <p className="text-sm text-on-surface-variant mb-5">{uiText("ui.review_technician_profiles_specialties_exper_9e1a873d57")}</p>
              <div className="space-y-2.5">
                {[
                  { label: uiText("ui.oem_experience_de75db266a"), sublabel: uiText("ui.profile_information_8cd6944d65"), color: "text-amber-600", bg: "bg-amber-500/10 border-amber-500/20" },
                  { label: uiText("ui.ase_credential_5d74241312"), sublabel: uiText("ui.verification_shown_separately_95a9e3e5ea"), color: "text-slate-600", bg: "bg-slate-300/30 border-slate-400/20" },
                  { label: uiText("ui.general_technician_bfc304cac6"), sublabel: uiText("ui.experience_and_specialties_dc700fe7a5"), color: "text-orange-700", bg: "bg-orange-400/10 border-orange-400/20" },
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
                <h3 className="text-2xl font-extrabold tracking-tighter mb-3">{uiText("ui.precision_reporting_24ea995d12")}</h3>
                <p className="text-sm text-on-surface-variant leading-relaxed mb-5">{uiText("ui.detailed_pdf_reports_with_high_resolution_im_185ba99391")}</p>
                <div className="flex gap-3">
                  {[uiText("ui.pdf_export_bdfbfdcb93"), uiText("ui.shareable_link_633cdcc3a7"), uiText("ui.media_package_8fd2abaf01")].map((f) => (
                    <span key={f} className="text-[11px] font-bold px-3 py-1 rounded-full bg-surface ghost-border text-on-surface-variant">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex-shrink-0 w-48 bg-white rounded-xl shadow-lg p-4 transform rotate-1">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[9px] font-bold text-slate-400">{uiText("ui.report_9921_x_4ef8eaef31")}</span>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-bold rounded">{uiText("ui.verified_8766e017df")}</span>
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
                <h2 className="text-3xl font-extrabold tracking-tighter mb-2">{uiText("ui.vehicles_for_sale_01fae15a32")}</h2>
                <p className="text-sm text-on-surface-variant max-w-md">{uiText("ui.public_listings_with_vehicle_details_and_ava_3087ddc117")}</p>
              </div>
              <Link
                href="/marketplace"
                className="flex items-center gap-1.5 text-sm font-bold text-on-tertiary-container hover:gap-3 transition-all"
              >{uiText("ui.browse_all_c04cc40ca0")}<ArrowRight className="h-4 w-4" />
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
                    href={`/marketplace/listings/${listing.id}`}
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
                      <p className="font-heading font-bold text-on-surface mb-2 truncate">{vehicleName || uiText("ui.vehicle_a62394ba4a")}</p>
                      <div className="flex flex-wrap gap-2 text-[11px] font-bold text-on-surface-variant">
                        {vehicle?.mileage != null && (
                          <span className="flex items-center gap-1 px-2.5 py-1 bg-surface-container rounded-full ghost-border">
                            <Gauge className="h-3 w-3" />{formatMileage(vehicle.mileage)}{uiText("ui.mi_3074dbe604")}</span>
                        )}
                        {listing.location && (
                          <span className="flex items-center gap-1 px-2.5 py-1 bg-surface-container rounded-full ghost-border">
                            <MapPin className="h-3 w-3" />{listing.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1 px-2.5 py-1 bg-teal/10 rounded-full text-teal">
                          {listing.inspection_summary ? (
                            <><ClipboardCheck className="h-3 w-3" />{listing.inspection_summary.scope === "dents_tires" ? uiText("ui.dents_tires_inspected_78c7c38229") : uiText("ui.complete_inspection_e53fe9cd46")}</>
                          ) : (
                            <><Tag className="h-3 w-3" />{uiText("ui.marketplace_listing_41f94479d2")}</>
                          )}
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
            <h2 className="text-3xl font-extrabold tracking-tighter mb-3">{uiText("ui.how_it_works_c1879525c7")}</h2>
            <p className="text-sm text-on-surface-variant max-w-md mx-auto">{uiText("ui.from_profile_setup_to_a_structured_inspectio_0759e8e02b")}</p>
          </div>
          <div className="relative flex flex-col md:flex-row justify-between gap-6">
            <div className="hidden md:block absolute top-9 left-0 right-0 h-px bg-outline-variant/30 -z-10" />
            {[
              { icon: UserCircle, label: uiText("ui.profile_d696a35bdd"), desc: uiText("ui.create_your_account_in_seconds_08dd73e687") },
              { icon: Car, label: uiText("ui.add_vehicle_f10cf1da45"), desc: uiText("ui.enter_your_vin_and_vehicle_details_49de5d2405") },
              { icon: Search, label: uiText("ui.inspection_6e4fa13da4"), desc: uiText("ui.self_perform_or_assign_a_technician_4bd6acd8e9") },
              { icon: BarChart3, label: uiText("ui.results_219c4a6c86"), desc: uiText("ui.receive_your_detailed_inspection_report_fb47374248") },
              { icon: BadgeCheck, label: uiText("ui.options_d0db8b5e36"), desc: uiText("ui.review_separate_provider_options_where_offer_fc1ce4fbdd") },
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

      {/* ── Product evidence ─────────────────────────────────────── */}
      <section className="py-20 px-8 bg-surface">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-14 items-center">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tighter mb-7 leading-tight">{uiText("ui.built_for_evidence_you_can_review_60f933b464")}</h2>
              <div className="bg-surface-container-lowest p-7 rounded-2xl ghost-border shadow-sm">
                <p className="text-base text-on-surface-variant leading-relaxed">{uiText("ui.inspection_answers_photos_obd_snapshots_repo_72100fbb95")}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { stat: "12", label: uiText("ui.inspection_sections_ae7bb79c64"), dark: false },
                { stat: uiText("ui.pdf_1d393b0081"), label: uiText("ui.downloadable_reports_45fba67c61"), dark: true },
                { stat: uiText("ui.obd_83282e99bb"), label: uiText("ui.diagnostic_snapshots_df0dc4f6cc"), dark: false, dimBg: true },
                { stat: "AI + Human", label: uiText("ui.reviewable_outputs_834b213296"), dark: false },
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
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tighter mb-5">{uiText("ui.ready_to_secure_your_next_asset_7657432e1a")}</h2>
            <p className="text-primary-fixed-dim max-w-lg mx-auto mb-8 text-base">{uiText("ui.join_the_network_of_collectors_dealers_and_t_7735221dd2")}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/signup"
                className="bg-white text-primary px-9 py-4 rounded-xl font-heading font-extrabold text-base shadow-lg hover:scale-105 transition-all"
              >{uiText("ui.get_started_now_cc3666dca7")}</Link>
              <Link
                href="/technicians"
                className="bg-white/10 backdrop-blur text-white px-9 py-4 rounded-xl font-heading font-extrabold text-base ghost-border hover:bg-white/20 transition-all"
              >{uiText("ui.find_a_technician_8f8aff766b")}</Link>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-on-tertiary-container/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
        </div>
      </section>
    </>
  );
}
