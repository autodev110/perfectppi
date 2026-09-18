import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getPublicVehicle,
  getVehiclePpiHistory,
} from "@/features/vehicles/queries";
import { getVehicleActiveListing } from "@/features/marketplace/queries";
import { FactorySpecComparison } from "@/components/shared/factory-spec-comparison";
import { BUILD_STAGE_STATUS_LABELS, buildProgress, groupBuildByStage } from "@/lib/vehicles/build-progression";
import {
  contactSellerFromListing,
  requestMarketplaceInspectionFromListing,
} from "@/features/marketplace/actions";
import { getPublicVehicleWarrantySnapshot } from "@/features/warranty/queries";
import { createCommunityComment } from "@/features/community/actions";
import { getVehicleDiscussionPosts } from "@/features/community/queries";
import { getPublicVehicleTimelines } from "@/features/vehicles/timelines";
import { SafetyNotice } from "@/components/shared/safety-notice";
import { ShareButton } from "@/components/shared/share-button";
import { sharePath } from "@/lib/share/links";
import { ListingSaveButton } from "@/components/shared/listing-save-button";
import { AcceptedAnswerControl } from "@/components/shared/accepted-answer-control";
import { CommunityLikeButton } from "@/components/shared/community-like-button";
import { CommunityHelpfulButton } from "@/components/shared/community-helpful-button";
import { CommunityAuthorEditor } from "@/components/shared/community-author-editor";
import { CommunityReplyForm } from "@/components/shared/community-reply-form";
import { QuestionOutcomeControl } from "@/components/shared/question-outcome-control";
import { SavedCollectionButton } from "@/components/shared/saved-collection-button";
import { BuildSubscriptionButton } from "@/components/shared/build-subscription-button";
import { getVehicleBuildSubscription } from "@/features/saved/collections";
import { getCurrentSocialProfileId } from "@/features/social/relationships";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatMileage, formatDate, getInitials, formatCurrency } from "@/lib/utils/formatting";
import {
  Car,
  ClipboardCheck,
  Calendar,
  Gauge,
  User,
  ShieldCheck,
  ArrowRight,
  Wrench,
  Tag,
  MapPin,
  MessageSquare,
  Shield,
  FileSignature,
  CreditCard,
} from "lucide-react";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

// ── Types ─────────────────────────────────────────────────────────────────────

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    contact_error?: string;
    inspection_error?: string;
    inspection_requested?: string;
  }>;
};

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const uiText = await getRequestTranslator();
  const { id } = await params;
  const vehicle = await getPublicVehicle(id);
  if (!vehicle) return {};

  const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  // Year/make/model only (plan 23.3, 15.4): never VIN, plate, or location.
  const description = uiText("ui.view_available_inspection_records_and_detail_b0b61d1846", { arg0: String(name) });
  return {
    title: uiText("ui.perfectppi_58cb425bbe", { arg0: String(name) }),
    description,
    openGraph: { title: uiText("ui.perfectppi_bcef5a6c45", { arg0: String(name) }), description, url: `/vehicle/${id}` },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  submitted: uiText("ui.submitted_64900440a8"),
  completed: uiText("ui.completed_22a970d2e5"),
};

const WARRANTY_STATUS_LABEL: Record<string, string> = {
  not_offered: uiText("ui.not_offered_9f2d36b68d"),
  offered: uiText("ui.offered_95e7004b8d"),
  viewed: uiText("ui.viewed_1b28d17855"),
  selected: uiText("ui.selected_57fd7a0cf3"),
  contract_pending: uiText("ui.contract_pending_370fb9845e"),
  signed: uiText("ui.signed_08251562b3"),
  payment_pending: uiText("ui.payment_pending_ac3729c091"),
  paid: uiText("ui.paid_fb81b961af"),
  failed: uiText("ui.payment_failed_a287ab868d"),
  cancelled: uiText("ui.cancelled_d353a99eb4"),
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PublicVehiclePage({ params, searchParams }: PageProps) {
  const uiText = await getRequestTranslator();
  const { id } = await params;
  const {
    tab,
    contact_error: contactError,
    inspection_error: inspectionError,
    inspection_requested: inspectionRequested,
  } = await searchParams;
  const activeTab = tab === "posts" || tab === "discussion"
    ? "posts"
    : tab === "build" || tab === "maintenance"
      ? tab
      : tab === "inspections" || tab === "ppi-history"
        ? "inspections"
        : "overview";

  const [vehicle, ppiHistory, activeListing, warrantySnapshot, discussionPosts, timelines, viewerId] = await Promise.all([
    getPublicVehicle(id),
    getVehiclePpiHistory(id),
    getVehicleActiveListing(id),
    getPublicVehicleWarrantySnapshot(id),
    getVehicleDiscussionPosts(id),
    getPublicVehicleTimelines(id),
    getCurrentSocialProfileId(),
  ]);

  if (!vehicle) notFound();

  const owner = vehicle.owner as {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
    is_public: boolean;
  } | null;

  const primaryMedia = (vehicle.vehicle_media as { url: string; is_primary: boolean }[])
    ?.find((m) => m.is_primary) ?? vehicle.vehicle_media?.[0] ?? null;

  const vehicleName = [vehicle.year, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(" ");

  const latestPpi = ppiHistory[0];
  const listingInspection = activeListing?.inspection_summary ?? null;
  const buildSubscribed = viewerId && !vehicle.viewer_is_owner
    ? await getVehicleBuildSubscription(viewerId, id)
    : false;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 sm:px-6 lg:px-8">

      {/* ── Hero card ─────────────────────────────────────────────── */}
      <div className="bg-surface-container-lowest rounded-[1.5rem] overflow-hidden ghost-border shadow-sm mb-6">
        {/* Photo or placeholder */}
        <div className="relative w-full h-56 bg-surface-container-low">
          {primaryMedia ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={(primaryMedia as { url: string }).url}
              alt={vehicleName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Car className="h-16 w-16 text-on-surface-variant/20" />
            </div>
          )}
          {/* Trust badge overlay */}
          {listingInspection && (
            <div className="absolute top-4 left-4 flex items-center gap-2 rounded-xl border border-teal/20 bg-white/90 px-3 py-1.5 text-xs font-bold text-teal backdrop-blur-sm">
              <ClipboardCheck className="h-3.5 w-3.5" />
              {listingInspection.scope === "dents_tires" ? uiText("ui.dents_tires_ea36eba96f") : uiText("ui.complete_143b270a32")} · {formatDate(listingInspection.inspected_at)}
            </div>
          )}
        </div>

        {/* Info row */}
        <div className="px-7 py-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-on-surface mb-1 break-words">
              {vehicle.nickname || vehicleName || uiText("ui.unknown_vehicle_615ff95383")}
            </h1>
            {vehicle.nickname && <p className="text-sm text-on-surface-variant mb-1">{vehicleName}</p>}
            {vehicle.trim && (
              <p className="text-sm text-on-surface-variant mb-3">{vehicle.trim}</p>
            )}
            {/* Spec pills */}
            <div className="flex flex-wrap gap-2 mt-2">
              {vehicle.ownership_state === "previously_owned" && (
                <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-surface-container ghost-border text-on-surface-variant">{uiText("ui.previously_owned_c56be55e86")}{vehicle.sold_at ? uiText("ui.text_913ac5c53d", { arg0: String(formatDate(vehicle.sold_at)) }) : ""}
                </span>
              )}
              {vehicle.visibility === "friends" && (
                <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-surface-container ghost-border text-on-surface-variant">{uiText("ui.friends_only_9f75521f3c")}</span>
              )}
              {vehicle.mileage != null && (
                <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-surface-container ghost-border text-on-surface-variant">
                  <Gauge className="h-3 w-3" />
                  {formatMileage(vehicle.mileage)}{uiText("ui.mi_3074dbe604")}</span>
              )}
              <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-surface-container ghost-border text-on-surface-variant">
                <Calendar className="h-3 w-3" />
                {activeListing
                  ? uiText("ui.listed_fdb00456ea", { arg0: String(formatDate(activeListing.created_at)) })
                  : uiText("ui.profile_created_175272670b", { arg0: String(formatDate(vehicle.created_at)) })}
              </span>
            </div>
          </div>

          {/* Owner + share */}
          <div className="flex flex-shrink-0 flex-col items-end gap-2">
          {vehicle.visibility === "public" ? (
            <ShareButton path={sharePath({ kind: "vehicle", id: vehicle.id })} title={uiText("ui.perfectppi_bcef5a6c45", { arg0: String(vehicleName) })} />
          ) : null}
          {viewerId ? <SavedCollectionButton entityType="vehicle" entityId={vehicle.id} /> : null}
          {owner && owner.is_public && (
            <Link
              href={`/profile/${owner.username ?? owner.id}`}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-container ghost-border hover:bg-surface-container-high transition-all flex-shrink-0"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={owner.avatar_url ?? ""} />
                <AvatarFallback className="text-xs">
                  {getInitials(owner.display_name ?? uiText("ui.u_a25513c7e0"))}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xs font-bold text-on-surface">
                  {owner.display_name ?? owner.username ?? uiText("ui.owner_4b1b8aa360")}
                </p>
                <p className="text-[10px] text-on-surface-variant">{uiText("ui.view_profile_d4788f256f")}</p>
              </div>
            </Link>
          )}
          </div>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      {/* Five tabs are wider than a phone viewport — scroll the strip itself
          rather than letting it push the whole page sideways. */}
      <div className="flex max-w-full gap-1 overflow-x-auto p-1 bg-surface-container rounded-xl ghost-border mb-6 w-full sm:w-fit">
        {[
          { key: "overview", label: uiText("ui.overview_d4b1ea5708") },
          { key: "posts", label: uiText("ui.posts_f975c2f59c", { arg0: String(discussionPosts.length > 0 ? ` (${discussionPosts.length})` : "") }) },
          { key: "build", label: uiText("ui.build_7d630a8ffd", { arg0: String(timelines.build.length > 0 ? ` (${timelines.build.length})` : "") }) },
          { key: "maintenance", label: uiText("ui.maintenance_c27b4ef54b", { arg0: String(timelines.maintenance.length > 0 ? ` (${timelines.maintenance.length})` : "") }) },
          { key: "inspections", label: uiText("ui.inspections_7dcdc3ec4f", { arg0: String(ppiHistory.length > 0 ? ` (${ppiHistory.length})` : "") }) },
        ].map(({ key, label }) => (
          <Link
            key={key}
            href={key === "overview" ? `/vehicle/${id}` : `/vehicle/${id}?tab=${key}`}
            className={`shrink-0 whitespace-nowrap px-5 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === key
                ? "bg-surface-container-lowest shadow-sm text-on-surface"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* ── Overview tab ──────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {/* Vehicle specs */}
          <div className="bg-surface-container-lowest rounded-[1.25rem] p-6 ghost-border shadow-sm">
            <h2 className="font-heading font-extrabold text-base mb-4 text-on-surface">{uiText("ui.vehicle_details_5f09e0a945")}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              {[
                { label: uiText("ui.year_89f6832560"), value: vehicle.year?.toString() },
                { label: uiText("ui.make_ccdd25d423"), value: vehicle.make },
                { label: uiText("ui.model_5e2c614c23"), value: vehicle.model },
                { label: uiText("ui.trim_aaa5478b26"), value: vehicle.trim },
                // Owner-confirmed configuration: a swapped engine or a 2WD
                // conversion must not read as factory equipment.
                { label: uiText("ui.configuration_b332c3492d"), value: vehicle.configuration_type === "custom_build" ? "Custom build" : vehicle.configuration_type === "modified" ? "Modified" : null },
                { label: uiText("ui.engine_8e75ebbdb2"), value: vehicle.engine ? `${vehicle.engine}${vehicle.engine_original === false ? " (swapped)" : ""}` : vehicle.engine_original === false ? "Swapped" : null },
                { label: uiText("ui.drivetrain_203e886158"), value: vehicle.drivetrain ? `${vehicle.drivetrain}${vehicle.drivetrain_original === false ? " (converted)" : ""}` : vehicle.drivetrain_original === false ? "Converted" : null },
                { label: uiText("ui.transmission_3e10134259"), value: vehicle.transmission ? `${vehicle.transmission}${vehicle.transmission_original === false ? " (swapped)" : ""}` : vehicle.transmission_original === false ? "Swapped" : null },
                { label: uiText("ui.body_style_191c24bf12"), value: vehicle.body_style },
                { label: uiText("ui.mileage_ffe44a0179"), value: vehicle.mileage != null ? `${formatMileage(vehicle.mileage)} miles${vehicle.mileage_status === "not_actual" ? " (not actual)" : vehicle.mileage_status === "unknown" ? " (unverified)" : ""}` : null },
              ].filter((f) => f.value).map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                    {label}
                  </p>
                  <p className="text-sm font-semibold text-on-surface break-words">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Factory spec vs current build (Renditions doc) */}
          {vehicle.factory_spec || vehicle.engine_original === false || vehicle.transmission_original === false || vehicle.drivetrain_original === false ? (
            <div className="bg-surface-container-lowest rounded-[1.25rem] p-6 ghost-border shadow-sm">
              <h2 className="font-heading font-extrabold text-base mb-4 text-on-surface">{uiText("ui.factory_spec_vs_current_build_b0fd096fdc")}</h2>
              <FactorySpecComparison
                spec={vehicle.factory_spec}
                current={{
                  engine: vehicle.engine, transmission: vehicle.transmission, drivetrain: vehicle.drivetrain,
                  body_style: vehicle.body_style, trim: vehicle.trim,
                  engine_original: vehicle.engine_original, transmission_original: vehicle.transmission_original, drivetrain_original: vehicle.drivetrain_original,
                }}
                ownerView={vehicle.viewer_is_owner}
              />
            </div>
          ) : null}

          {/* Inspection summary */}
          <div className="bg-surface-container-lowest rounded-[1.25rem] p-6 ghost-border shadow-sm">
            <h2 className="font-heading font-extrabold text-base mb-4 text-on-surface">{uiText("ui.inspection_summary_23ed878855")}</h2>
            {ppiHistory.length === 0 ? (
              <div className="flex items-center gap-3 text-on-surface-variant">
                <ClipboardCheck className="h-5 w-5 opacity-40" />
                <p className="text-sm">{uiText("ui.no_submitted_ppi_reports_are_attached_to_thi_d12bb8cab2")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-on-surface">
                      {ppiHistory.length}{uiText("ui.inspection_6ddb257e8e")}{ppiHistory.length !== 1 ? uiText("ui.s_043a718774") : ""}{uiText("ui.on_record_58f3bc38ea")}</p>
                    <p className="text-xs text-on-surface-variant">{uiText("ui.most_recent_79460bb63f")}{formatDate(latestPpi!.created_at)}
                    </p>
                  </div>
                  {latestPpi && (
                    <span className="ml-auto flex items-center gap-1.5 rounded-xl border border-teal/20 bg-teal/10 px-3 py-1.5 text-xs font-bold text-teal">
                      <ClipboardCheck className="h-3 w-3" />
                      {latestPpi.inspection_scope === "dents_tires" ? uiText("ui.dents_tires_ea36eba96f") : uiText("ui.complete_143b270a32")}
                    </span>
                  )}
                </div>
                <Link
                  href={`/vehicle/${id}?tab=inspections`}
                  className="flex items-center gap-2 text-xs font-bold text-on-tertiary-container hover:gap-3 transition-all mt-2"
                >{uiText("ui.view_full_inspection_history_dd10215e58")}<ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>

          {/* CTAs */}
          <div className="bg-primary-container rounded-[1.25rem] p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
            <div className="relative z-10">
              <h2 className="font-heading font-extrabold text-base mb-1">{uiText("ui.request_an_inspection_96d2bce826")}</h2>
              <p className="text-sm text-primary-fixed-dim mb-5">{uiText("ui.request_a_ppi_from_an_available_technician_a_3e8e9f2443")}</p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="flex items-center gap-2 bg-white text-primary px-5 py-2.5 rounded-xl text-sm font-bold shadow hover:scale-105 transition-all"
                >
                  <Wrench className="h-4 w-4" />{uiText("ui.request_technician_ppi_244efef457")}</Link>
                <Link
                  href="/technicians"
                  className="flex items-center gap-2 bg-white/10 text-white px-5 py-2.5 rounded-xl text-sm font-bold ghost-border hover:bg-white/20 transition-all"
                >
                  <User className="h-4 w-4" />{uiText("ui.browse_technicians_b612da0c71")}</Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Listing is contextual passport content, not a permanent tab. */}
      {activeTab === "overview" && activeListing && (
        <div className="bg-surface-container-lowest rounded-[1.25rem] p-6 ghost-border shadow-sm">
          {activeListing ? (
            <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-start">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="h-4 w-4 text-on-tertiary-container" />
                  <Badge className="bg-teal/10 text-teal hover:bg-teal/10">
                    {activeListing.status === "pending" ? uiText("ui.sale_pending_22fc610c46") : uiText("ui.active_listing_f78079dc05")}
                  </Badge>
                </div>
                <h2 className="font-heading text-2xl font-extrabold tracking-tight text-on-surface mb-2 break-words">
                  {activeListing.title}
                </h2>
                {activeListing.description ? (
                  <p className="text-sm text-on-surface-variant leading-relaxed break-words">
                    {activeListing.description}
                  </p>
                ) : (
                  <p className="text-sm text-on-surface-variant">{uiText("ui.no_seller_description_has_been_added_yet_a2a948e18a")}</p>
                )}
                {activeListing.inspection_summary && (
                  <div className="mt-5 rounded-2xl bg-teal/10 p-4 text-sm text-on-surface ghost-border">
                    <div className="flex items-center gap-2 font-bold">
                      <ClipboardCheck className="h-4 w-4 text-teal" />
                      {activeListing.inspection_summary.scope === "dents_tires"
                        ? uiText("ui.dents_tires_inspection_e9b5f53170")
                        : uiText("ui.complete_inspection_e53fe9cd46")}
                    </div>
                    <p className="mt-1 text-xs text-on-surface-variant">{uiText("ui.inspected_8827e62e78")}{formatDate(activeListing.inspection_summary.inspected_at)}{uiText("ui.by_52e86deffb")}{activeListing.inspection_summary.performed_by}.
                    </p>
                    <p className="mt-2 text-[11px] text-on-surface-variant">{uiText("ui.this_inspection_reflects_the_vehicle_at_that_e3e19173a4")}</p>
                  </div>
                )}
              </div>

              <div className="min-w-0 rounded-2xl bg-surface-container p-5 ghost-border">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">{uiText("ui.asking_price_eeb164d8de")}</p>
                <p className="font-heading text-3xl font-black tracking-tight text-primary mb-4">
                  {formatCurrency(activeListing.asking_price_cents)}
                </p>

                <div className="space-y-3 text-sm">
                  {activeListing.location && (
                    <div className="flex items-center gap-2 text-on-surface-variant">
                      <MapPin className="h-4 w-4" />
                      {activeListing.location}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-on-surface-variant">
                    <Calendar className="h-4 w-4" />{uiText("ui.listed_5aadd10d19")}{formatDate(activeListing.created_at)}
                  </div>
                </div>

                <Link
                  href={`/marketplace/listings/${activeListing.id}`}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-primary px-5 py-3 text-sm font-bold text-primary hover:bg-primary/5 transition-colors"
                >
                  {activeListing.viewer_is_seller ? uiText("ui.manage_listing_f013a973e5") : uiText("ui.view_full_listing_a9319f6f1d")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                {activeListing.viewer_is_seller ? null : (
                  <form action={contactSellerFromListing}>
                    <input type="hidden" name="listing_id" value={activeListing.id} />
                    <input type="hidden" name="vehicle_id" value={id} />
                    <button
                      type="submit"
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity"
                    >{uiText("ui.message_seller_21fc80c704")}<ArrowRight className="h-4 w-4" />
                    </button>
                  </form>
                )}
                {!activeListing.viewer_is_seller ? (
                  <div className="mt-3">
                    <ListingSaveButton listingId={activeListing.id} initialSaved={activeListing.saved_by_viewer} variant="inline" />
                  </div>
                ) : null}
                {!activeListing.viewer_is_seller && activeListing.inspection_request ? (
                  <div className="mt-3 rounded-xl bg-teal/10 px-4 py-3 text-center text-xs font-bold text-teal ghost-border">{uiText("ui.inspection_requested_f051fb089f")}{activeListing.inspection_request.status.replaceAll("_", " ")}
                  </div>
                ) : !activeListing.viewer_is_seller ? (
                  <form action={requestMarketplaceInspectionFromListing}>
                    <input type="hidden" name="listing_id" value={activeListing.id} />
                    <input type="hidden" name="vehicle_id" value={id} />
                    <input type="hidden" name="scope" value="complete" />
                    <button
                      type="submit"
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-primary px-5 py-3 text-sm font-bold text-primary hover:bg-primary/5 transition-colors"
                    >
                      <ClipboardCheck className="h-4 w-4" />{uiText("ui.request_inspection_7ad098f214")}</button>
                  </form>
                ) : null}
                {!activeListing.viewer_is_seller && (
                  <p className="mt-2 text-[11px] text-on-surface-variant">{uiText("ui.opens_your_existing_thread_with_this_seller__d8fd599ae7")}</p>
                )}
                {inspectionRequested && (
                  <p className="mt-2 text-xs font-semibold text-teal">{uiText("ui.your_inspection_request_was_sent_d32b1335db")}</p>
                )}
                {inspectionError && (
                  <p className="mt-2 text-xs font-semibold text-destructive break-words">
                    {inspectionError}
                  </p>
                )}
                {contactError && (
                  <p className="mt-2 text-xs font-semibold text-destructive break-words">
                    {contactError}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-10">
              <Tag className="h-10 w-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="font-heading font-bold text-on-surface mb-1">{uiText("ui.this_vehicle_is_not_listed_for_sale_8d488e4544")}</p>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto">{uiText("ui.if_the_owner_publishes_a_marketplace_listing_b590401d24")}</p>
            </div>
          )}
        </div>
      )}

      {/* Coverage is contextual passport content, not a permanent tab. */}
      {activeTab === "overview" && warrantySnapshot && (
        <div className="space-y-4">
          {warrantySnapshot ? (
            <>
              <div className="bg-surface-container-lowest rounded-[1.25rem] p-6 ghost-border shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="h-4 w-4 text-on-tertiary-container" />
                  <p className="font-heading font-extrabold text-on-surface">{uiText("ui.vehicle_service_contract_status_9150d15b72")}</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-surface-container p-4 ghost-border">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">{uiText("ui.offer_0cf57c63eb")}</p>
                    <p className="text-sm font-bold text-on-surface">
                      {WARRANTY_STATUS_LABEL[warrantySnapshot.option.status] ?? warrantySnapshot.option.status}
                    </p>
                    {warrantySnapshot.option.offered_at && (
                      <p className="text-[11px] text-on-surface-variant mt-1">{uiText("ui.offered_4b2c2b42e7")}{formatDate(warrantySnapshot.option.offered_at)}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl bg-surface-container p-4 ghost-border">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">{uiText("ui.selected_plan_1b2c766b4a")}</p>
                    <p className="text-sm font-bold text-on-surface">
                      {warrantySnapshot.order?.plan_name ?? uiText("ui.not_selected_df12aeba9b")}
                    </p>
                    {warrantySnapshot.order && (
                      <p className="text-[11px] text-on-surface-variant mt-1">
                        {formatCurrency(warrantySnapshot.order.price_cents)}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl bg-surface-container p-4 ghost-border">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">{uiText("ui.payment_7048f38b33")}</p>
                    <p className="text-sm font-bold text-on-surface">
                      {warrantySnapshot.payment
                        ? warrantySnapshot.payment.status === "completed"
                          ? uiText("ui.paid_fb81b961af")
                          : warrantySnapshot.payment.status === "failed"
                            ? uiText("ui.failed_031a8f0f65")
                            : warrantySnapshot.payment.status === "refunded"
                              ? uiText("ui.refunded_117f6a7cf0")
                              : uiText("ui.pending_331551b0de")
                        : uiText("ui.not_paid_1e6a78758a")}
                    </p>
                    {warrantySnapshot.payment?.paid_at && (
                      <p className="text-[11px] text-on-surface-variant mt-1">{uiText("ui.paid_70f97cde6c")}{formatDate(warrantySnapshot.payment.paid_at)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-[1.25rem] p-6 ghost-border shadow-sm">
                <h3 className="font-heading font-extrabold text-sm text-on-surface mb-3">{uiText("ui.flow_progress_466084dce3")}</h3>
                <div className="space-y-2.5">
                  {[
                    {
                      icon: Shield,
                      label: uiText("ui.offer_created_bf9f0a9b0a"),
                      value: !!warrantySnapshot.option,
                      meta: warrantySnapshot.option.created_at,
                    },
                    {
                      icon: Tag,
                      label: uiText("ui.plan_selected_b91e36f277"),
                      value: !!warrantySnapshot.order,
                      meta: warrantySnapshot.order?.selected_at ?? null,
                    },
                    {
                      icon: FileSignature,
                      label: uiText("ui.contract_signed_773a167fa5"),
                      value: !!warrantySnapshot.contract?.signed_at,
                      meta: warrantySnapshot.contract?.signed_at ?? null,
                    },
                    {
                      icon: CreditCard,
                      label: uiText("ui.payment_completed_c501feea91"),
                      value: warrantySnapshot.payment?.status === "completed",
                      meta: warrantySnapshot.payment?.paid_at ?? null,
                    },
                  ].map((step) => (
                    <div key={step.label} className="flex items-center gap-3 rounded-xl bg-surface-container p-3 ghost-border">
                      <div
                        className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                          step.value ? "bg-teal/15 text-teal" : "bg-surface-container-high text-on-surface-variant"
                        }`}
                      >
                        <step.icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-on-surface">{step.label}</p>
                        <p className="text-[11px] text-on-surface-variant">
                          {step.meta ? formatDate(step.meta) : uiText("ui.not_reached_yet_07b0eec3c9")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-surface-container-lowest rounded-[1.25rem] p-10 ghost-border text-center">
              <Shield className="h-10 w-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="font-heading font-bold text-on-surface mb-1">{uiText("ui.no_vehicle_service_contract_data_yet_d34dc6f41a")}</p>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto">{uiText("ui.warranty_status_appears_once_a_completed_ins_b2ee5928ad")}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Posts tab ────────────────────────────────────────────── */}
      {activeTab === "posts" && (
        <div className="space-y-4">
          {discussionPosts.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-[1.25rem] p-10 ghost-border text-center">
              <MessageSquare className="h-10 w-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="font-heading font-bold text-on-surface mb-1">{uiText("ui.no_vehicle_discussions_yet_420eb2bae8")}</p>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto mb-5">{uiText("ui.community_posts_that_reference_this_vehicle__3ca2d22ff4")}</p>
              <Button asChild>
                <Link href="/dashboard/posts/new">{uiText("ui.create_post_80c6491121")}</Link>
              </Button>
            </div>
          ) : (
            discussionPosts.map((post) => (
              <article
                key={post.id}
                className="bg-surface-container-lowest rounded-[1.25rem] p-6 ghost-border shadow-sm"
              >
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={post.author?.avatar_url ?? ""} />
                      <AvatarFallback className="text-xs">
                        {getInitials(post.author?.display_name ?? post.author?.username ?? uiText("ui.u_a25513c7e0"))}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-bold text-on-surface">
                          {post.author?.display_name ?? post.author?.username ?? uiText("ui.perfectppi_user_77df1ce619")}
                        </p>
                        {post.post_type === "question" ? (
                          <Badge className="bg-teal/10 text-teal hover:bg-teal/10">
                            {post.accepted_answer_comment_id ? uiText("ui.solved_eb858c458b") : uiText("ui.question_289aff12b0")}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-[10px] text-on-surface-variant">
                        {formatDate(post.created_at)}
                        {post.edited_at ? <span title={uiText("ui.edited_b37cf770a2", { arg0: String(formatDate(post.edited_at)) })}>{uiText("ui.edited_e9d550c507")}</span> : null}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/community"
                    className="text-[11px] font-bold text-on-tertiary-container hover:underline"
                  >{uiText("ui.open_feed_6b535fbe14")}</Link>
                </div>

                <p className="text-sm text-on-surface-variant whitespace-pre-wrap mb-5">
                  {post.content}
                </p>
                {post.safety_notice ? (
                  <div className="mb-5">
                    <SafetyNotice notice={post.safety_notice} compact />
                  </div>
                ) : null}
                {post.post_type === "question" ? (
                  <QuestionOutcomeControl
                    postId={post.id}
                    initialOutcome={post.question_outcome}
                    hasAcceptedAnswer={Boolean(post.accepted_answer_comment_id)}
                    canManage={post.can_manage_accepted_answer}
                  />
                ) : null}

                <div className="mb-4">
                  <CommunityLikeButton
                    postId={post.id}
                    initialLiked={post.liked_by_viewer}
                    initialCount={post.like_count}
                    disabled={!post.can_like}
                  />
                </div>

                {post.comments.length > 0 && (
                  <div className="space-y-2.5 mb-4">
                    {post.comments.map((comment) => {
                      const isReply = Boolean(comment.parent_comment_id);
                      const authorName = comment.author?.display_name ?? comment.author?.username ?? uiText("ui.perfectppi_user_77df1ce619");
                      if (comment.removed) {
                        return (
                          <div key={comment.id} className="rounded-xl bg-surface-container p-3 text-xs italic text-on-surface-variant ghost-border">{uiText("ui.comment_removed_f80ae1c83e")}</div>
                        );
                      }
                      const text = (
                        <p className="text-xs text-on-surface-variant whitespace-pre-wrap">
                          {comment.content}
                        </p>
                      );
                      return (
                      <div
                        key={comment.id}
                        className={`rounded-xl bg-surface-container p-3 ghost-border ${post.accepted_answer_comment_id === comment.id ? "ring-2 ring-teal/30" : ""} ${isReply ? "ml-5 border-l-2 border-outline-variant/40 sm:ml-8" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <p className="text-[11px] font-bold text-on-surface">{authorName}</p>
                          <p className="text-[10px] text-on-surface-variant">
                            {formatDate(comment.created_at)}
                            {comment.edited_at ? <span title={uiText("ui.edited_b37cf770a2", { arg0: String(formatDate(comment.edited_at)) })}>{uiText("ui.edited_e9d550c507")}</span> : null}
                          </p>
                        </div>
                        {post.post_type === "question" && !isReply ? (
                          <AcceptedAnswerControl
                            postId={post.id}
                            commentId={comment.id}
                            accepted={post.accepted_answer_comment_id === comment.id}
                            canManage={post.can_manage_accepted_answer}
                            ownResponse={comment.author_id === post.author_id}
                          />
                        ) : null}
                        {comment.can_edit ? (
                          <CommunityAuthorEditor entityType="comment" entityId={comment.id} initialContent={comment.content} canRemove={comment.can_remove}>
                            {text}
                          </CommunityAuthorEditor>
                        ) : text}
                        {post.post_type === "question" && !isReply ? (
                          <CommunityHelpfulButton
                            commentId={comment.id}
                            initialHelpful={comment.helpful_by_viewer}
                            initialCount={comment.helpful_count}
                            disabled={!comment.can_mark_helpful}
                          />
                        ) : null}
                        {post.can_interact && !isReply ? (
                          <CommunityReplyForm postId={post.id} parentCommentId={comment.id} replyingTo={authorName} />
                        ) : null}
                      </div>
                      );
                    })}
                  </div>
                )}

                <form action={createCommunityComment} className="space-y-2.5">
                  <input type="hidden" name="post_id" value={post.id} />
                  <Textarea
                    name="content"
                    rows={3}
                    maxLength={600}
                    placeholder={uiText("ui.add_a_comment_23c5f33170")}
                  />
                  <Button type="submit" size="sm">{uiText("ui.comment_44f5e3fbec")}</Button>
                </form>
              </article>
            ))
          )}
        </div>
      )}

      {/* ── Build tab ─────────────────────────────────────────────── */}
      {activeTab === "build" && (
        <div className="space-y-4">
          {viewerId && !vehicle.viewer_is_owner ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] bg-surface-container-lowest p-4 ghost-border">
              <div><p className="text-sm font-bold">{uiText("ui.build_updates_50d14a2209")}</p><p className="text-xs text-on-surface-variant">{uiText("ui.private_subscription_it_is_never_shown_as_a__c2b2c9361a")}</p></div>
              <BuildSubscriptionButton vehicleId={vehicle.id} initialSubscribed={buildSubscribed} />
            </div>
          ) : null}
          <PublicBuildTimeline entries={timelines.build} stages={timelines.stages} canSave={!!viewerId} />
        </div>
      )}

      {/* ── Maintenance tab ───────────────────────────────────────── */}
      {activeTab === "maintenance" && (
        <PublicMaintenanceTimeline events={timelines.maintenance} />
      )}

      {/* ── Inspections tab ───────────────────────────────────────── */}
      {activeTab === "inspections" && (
        <div className="space-y-4">
          {ppiHistory.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-[1.25rem] p-10 ghost-border text-center">
              <ClipboardCheck className="h-10 w-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="font-heading font-bold text-on-surface mb-1">{uiText("ui.no_inspections_yet_fd46a43da4")}</p>
              <p className="text-sm text-on-surface-variant">{uiText("ui.submitted_ppi_reports_will_appear_here_after_50b38d9e22")}</p>
            </div>
          ) : (
            ppiHistory.map((ppi, i) => {
              const requester = ppi.requester as { display_name: string | null; username: string | null; avatar_url: string | null; is_public: boolean } | null;
              const tech = ppi.assigned_tech as { display_name: string | null; username: string | null; avatar_url: string | null; is_public: boolean } | null;

              return (
                <div
                  key={ppi.id}
                  className="bg-surface-container-lowest rounded-[1.25rem] p-6 ghost-border shadow-sm flex flex-col sm:flex-row sm:items-center gap-5"
                >
                  {/* Index */}
                  <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-surface-container flex items-center justify-center">
                    <span className="text-xs font-black text-on-surface-variant">
                      #{ppiHistory.length - i}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="flex items-center gap-1.5 rounded-lg border border-teal/20 bg-teal/10 px-2.5 py-1 text-[11px] font-bold text-teal">
                        <ClipboardCheck className="h-3 w-3" />
                        {ppi.inspection_scope === "dents_tires" ? uiText("ui.dents_tires_ea36eba96f") : uiText("ui.complete_inspection_e53fe9cd46")}
                      </span>
                      <Badge variant="outline" className="text-[11px]">
                        {STATUS_LABEL[ppi.status] ?? ppi.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-on-surface-variant">
                      {formatDate(ppi.created_at)}
                    </p>
                  </div>

                  {/* Performer */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {tech?.is_public ? (
                      <>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={tech.avatar_url ?? ""} />
                          <AvatarFallback className="text-xs">
                            {getInitials(tech.display_name ?? uiText("ui.t_e632b7095b"))}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-xs font-bold text-on-surface">
                            {tech.display_name ?? uiText("ui.technician_9041ccc417")}
                          </p>
                          <p className="text-[10px] text-on-surface-variant">{uiText("ui.inspector_da188e3b1c")}</p>
                        </div>
                      </>
                    ) : requester?.is_public ? (
                      <>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={requester.avatar_url ?? ""} />
                          <AvatarFallback className="text-xs">
                            {getInitials(requester.display_name ?? uiText("ui.u_a25513c7e0"))}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-xs font-bold text-on-surface">
                            {requester.display_name ?? uiText("ui.owner_4b1b8aa360")}
                          </p>
                          <p className="text-[10px] text-on-surface-variant">{uiText("ui.self_inspection_44834b4fae")}</p>
                        </div>
                      </>
                    ) : null}
                  </div>

                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

type PublicTimelines = Awaited<ReturnType<typeof getPublicVehicleTimelines>>;

// Build progression (Renditions doc): shared stages group shared entries;
// before/after specs and approved photos are public, costs never are.
function PublicBuildTimeline({ entries, stages, canSave }: { entries: PublicTimelines["build"]; stages: PublicTimelines["stages"]; canSave: boolean }) {
  if (entries.length === 0 && stages.length === 0) {
    return <TimelineEmpty icon={<Wrench className="h-10 w-10" />} title={uiText("ui.no_shared_build_entries_2f7dd995d0")} message={uiText("ui.the_owner_has_not_shared_any_modifications_f_981fca4a3a")} />;
  }
  const groups = groupBuildByStage(stages, entries);
  const progress = buildProgress(stages, entries);
  return (
    <div className="space-y-6">
      {stages.length > 0 ? (
        <div className="rounded-[1.25rem] bg-surface-container-lowest p-5 shadow-sm ghost-border">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="font-bold">{uiText("ui.build_progression_1925373c77")}</p>
            <p className="text-on-surface-variant">{progress.done}{uiText("ui.of_a4282e4b22")}{progress.total}{uiText("ui.stages_complete_a54cd3e3de")}</p>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-container" aria-hidden="true">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      ) : null}
      {groups.map((group) => (
        <section key={group.stage?.id ?? "unstaged"} className="space-y-3">
          {group.stage ? (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div>
                <h2 className="font-heading text-lg font-extrabold text-on-surface">{group.stage.title}</h2>
                {group.stage.description ? <p className="text-sm text-on-surface-variant">{group.stage.description}</p> : null}
              </div>
              <Badge variant="outline">{BUILD_STAGE_STATUS_LABELS[group.stage.status]}{group.stage.completed_on ? uiText("ui.text_913ac5c53d", { arg0: String(formatDate(group.stage.completed_on)) }) : ""}</Badge>
            </div>
          ) : stages.length > 0 ? (
            <h2 className="px-1 font-heading text-lg font-extrabold text-on-surface">{uiText("ui.other_modifications_12c49ea14a")}</h2>
          ) : null}
          {group.entries.length === 0 ? <p className="px-1 text-sm text-on-surface-variant">{uiText("ui.no_shared_entries_in_this_stage_yet_acba570577")}</p> : null}
          {group.entries.map((entry) => (
        <article id={`build-${entry.id}`} key={entry.id} className="scroll-mt-24 rounded-[1.25rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{entry.category}</p><h2 className="mt-1 font-heading text-lg font-extrabold text-on-surface">{entry.title}</h2></div>
            <Badge variant="outline">{entry.status.replaceAll("_", " ")}</Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-on-surface-variant">
            {entry.manufacturer && <span className="rounded-lg bg-surface-container px-3 py-1.5">{entry.manufacturer}{entry.part_number ? uiText("ui.text_913ac5c53d", { arg0: String(entry.part_number) }) : ""}</span>}
            {entry.installed_on && <span className="rounded-lg bg-surface-container px-3 py-1.5">{formatDate(entry.installed_on)}</span>}
            {entry.mileage != null && <span className="rounded-lg bg-surface-container px-3 py-1.5">{formatMileage(entry.mileage)}{uiText("ui.mi_3074dbe604")}</span>}
            <span className="rounded-lg bg-surface-container px-3 py-1.5">{entry.fitment_confidence.replaceAll("_", " ")}</span>
          </div>
          {[entry.vehicle_configuration, entry.wheel_size && uiText("ui.wheels_a727b1d45e", { arg0: String(entry.wheel_size) }), entry.wheel_width != null && uiText("ui.width_in_241c06fc53", { arg0: String(entry.wheel_width) }), entry.wheel_offset_mm != null && uiText("ui.offset_mm_562464b572", { arg0: String(entry.wheel_offset_mm) }), entry.tire_size && uiText("ui.tires_201a935d20", { arg0: String(entry.tire_size) }), entry.suspension_drop && uiText("ui.drop_ca99ada333", { arg0: String(entry.suspension_drop) })].filter(Boolean).length > 0 && (
            <p className="mt-4 text-sm text-on-surface-variant">{[entry.vehicle_configuration, entry.wheel_size && uiText("ui.wheels_a727b1d45e", { arg0: String(entry.wheel_size) }), entry.wheel_width != null && uiText("ui.width_in_241c06fc53", { arg0: String(entry.wheel_width) }), entry.wheel_offset_mm != null && uiText("ui.offset_mm_562464b572", { arg0: String(entry.wheel_offset_mm) }), entry.tire_size && uiText("ui.tires_201a935d20", { arg0: String(entry.tire_size) }), entry.suspension_drop && uiText("ui.drop_ca99ada333", { arg0: String(entry.suspension_drop) })].filter(Boolean).join(" · ")}</p>
          )}
          {(entry.before_spec || entry.after_spec) && (
            <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-lg bg-surface-container px-2 py-1 text-on-surface-variant">{entry.before_spec ?? "—"}</span>
              <ArrowRight className="h-4 w-4 text-on-surface-variant" />
              <span className="rounded-lg bg-primary/10 px-2 py-1 font-semibold">{entry.after_spec ?? "—"}</span>
            </p>
          )}
          {entry.public_notes && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-on-surface">{entry.public_notes}</p>}
          {entry.photos.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {entry.photos.map((photo) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={photo.media_id} src={photo.url} alt={uiText("ui.photo_d806f25a03", { arg0: String(entry.title) })} className="h-24 w-32 rounded-xl object-cover" loading="lazy" />
              ))}
            </div>
          ) : null}
          {canSave ? <div className="mt-4"><SavedCollectionButton entityType="build" entityId={entry.id} /></div> : null}
          <p className="mt-4 text-[11px] text-on-surface-variant">{uiText("ui.owner_reported_unless_a_stronger_source_is_s_d980413bd0")}</p>
        </article>
          ))}
        </section>
      ))}
    </div>
  );
}

function PublicMaintenanceTimeline({ events }: { events: PublicTimelines["maintenance"] }) {
  if (events.length === 0) {
    return <TimelineEmpty icon={<Wrench className="h-10 w-10" />} title={uiText("ui.no_shared_maintenance_e1898498d9")} message={uiText("ui.the_owner_has_not_shared_any_maintenance_rec_709791e428")} />;
  }
  return (
    <div className="space-y-4">
      {events.map((event) => (
        <article key={event.id} className="rounded-[1.25rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{uiText("ui.maintenance_17ccfa5b68")}</p><h2 className="mt-1 font-heading text-lg font-extrabold text-on-surface">{event.service_type}</h2></div>
            <span className="text-sm font-semibold text-on-surface-variant">{formatDate(event.serviced_on)}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-on-surface-variant">
            {event.mileage != null && <span className="rounded-lg bg-surface-container px-3 py-1.5">{formatMileage(event.mileage)}{uiText("ui.mi_3074dbe604")}</span>}
            {event.provider && <span className="rounded-lg bg-surface-container px-3 py-1.5">{event.provider}</span>}
            {event.next_due_on && <span className="rounded-lg bg-surface-container px-3 py-1.5">{uiText("ui.next_due_335850a2e4")}{formatDate(event.next_due_on)}</span>}
            {event.next_due_mileage != null && <span className="rounded-lg bg-surface-container px-3 py-1.5">{uiText("ui.due_at_1933526533")}{formatMileage(event.next_due_mileage)}{uiText("ui.mi_3074dbe604")}</span>}
          </div>
          {event.parts_fluids && <p className="mt-4 whitespace-pre-wrap text-sm text-on-surface"><strong>{uiText("ui.parts_and_fluids_17e9cc6dc8")}</strong> {event.parts_fluids}</p>}
          {event.public_notes && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-on-surface">{event.public_notes}</p>}
          <p className="mt-4 text-[11px] text-on-surface-variant">{uiText("ui.owner_reported_service_record_private_receip_4f1f85544d")}</p>
        </article>
      ))}
    </div>
  );
}

function TimelineEmpty({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return (
    <div className="rounded-[1.25rem] bg-surface-container-lowest p-10 text-center ghost-border">
      <div className="mx-auto mb-3 w-fit text-on-surface-variant/30">{icon}</div>
      <p className="font-heading font-bold text-on-surface">{title}</p>
      <p className="mt-1 text-sm text-on-surface-variant">{message}</p>
    </div>
  );
}
