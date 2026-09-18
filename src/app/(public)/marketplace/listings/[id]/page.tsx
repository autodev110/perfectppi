import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMarketplaceListingDetail, getMarketplaceListing } from "@/features/marketplace/queries";
import { contactSellerFromListing, requestMarketplaceInspectionFromListing } from "@/features/marketplace/actions";
import { getCurrentSocialProfileId } from "@/features/social/relationships";
import { ListingGallery } from "@/components/shared/listing-gallery";
import { ListingManagePanel } from "@/components/shared/listing-manage-panel";
import { ListingSaveButton } from "@/components/shared/listing-save-button";
import { SavedCollectionButton } from "@/components/shared/saved-collection-button";
import { InspectionReportCard } from "@/components/shared/inspection-report-card";
import { ShareButton } from "@/components/shared/share-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatMileage, getInitials } from "@/lib/utils/formatting";
import { NEUTRAL_SHARE_CARD, shareCardTitle, sharePath } from "@/lib/share/links";
import { LISTING_STATUS_LABELS, isListingPublic } from "@/lib/marketplace/listing-status";
import { SELLER_TYPE_LABELS } from "@/lib/marketplace/filters";
import { inspectionAge } from "@/lib/marketplace/inspection-report";
import { parseFactorySpec } from "@/lib/vehicles/factory-spec";
import { FactorySpecComparison } from "@/components/shared/factory-spec-comparison";
import { recordProductEvent } from "@/features/analytics/product-events";
import { ExtendedReportControl } from "@/components/shared/extended-report-control";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  ClipboardCheck,
  Gauge,
  MapPin,
  MessageSquare,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ contact_error?: string; inspection_error?: string; inspection_requested?: string; manage_error?: string }>;
};

function vehicleLabel(listing: { vehicle: { year: number | null; make: string | null; model: string | null; trim: string | null } | null }) {
  return [listing.vehicle?.year, listing.vehicle?.make, listing.vehicle?.model, listing.vehicle?.trim].filter(Boolean).join(" ");
}

// Share cards only carry what an anonymous visitor may see (plan 15.4).
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const listing = await getMarketplaceListing(id);
  if (!listing || !isListingPublic(listing.status)) {
    return { title: NEUTRAL_SHARE_CARD.title, description: NEUTRAL_SHARE_CARD.description, robots: { index: false } };
  }
  const label = `${listing.title} · ${formatCurrency(listing.asking_price_cents)}`;
  const photo = listing.vehicle?.vehicle_media.find((m) => m.is_primary)?.url ?? listing.vehicle?.vehicle_media[0]?.url;
  return {
    title: shareCardTitle({ kind: "listing", id }, listing.title),
    description: [vehicleLabel(listing), listing.location].filter(Boolean).join(" · ") || label,
    openGraph: { title: label, images: photo ? [{ url: photo }] : undefined },
  };
}

// The listing screen (plan 25.2), top to bottom: gallery → price & vehicle →
// Save/Share → inspection → description & specs → highlights → seller →
// safety → sticky actions. Owners get Manage Listing instead of contact.
export default async function MarketplaceListingPage({ params, searchParams }: PageProps) {
  const uiText = await getRequestTranslator();
  const [{ id }, query, viewerId] = await Promise.all([params, searchParams, getCurrentSocialProfileId()]);
  const listing = await getMarketplaceListingDetail(id);
  if (!listing) notFound();

  const isOwner = listing.viewer_is_seller;
  const isPublic = isListingPublic(listing.status);
  const canContact = !isOwner && isPublic;
  const path = sharePath({ kind: "listing", id: listing.id });
  const label = vehicleLabel(listing);
  const vehicle = listing.vehicle;
  const seller = listing.seller;
  if (viewerId && !isOwner) {
    await recordProductEvent({
      profileId: viewerId,
      eventName: "listing_viewed",
      surface: "marketplace",
      dedupeId: listing.id,
    });
  }
  const specs = [
    [uiText("ui.year_89f6832560"), vehicle?.year],
    [uiText("ui.make_ccdd25d423"), vehicle?.make],
    [uiText("ui.model_5e2c614c23"), vehicle?.model],
    [uiText("ui.trim_aaa5478b26"), vehicle?.trim],
    [uiText("ui.mileage_ffe44a0179"), vehicle?.mileage != null ? `${formatMileage(vehicle.mileage)} mi${vehicle.mileage_status === "not_actual" ? uiText("ui.not_actual_f788c337c8") : vehicle.mileage_status === "unknown" ? " (unverified)" : ""}${vehicle.mileage_updated_at ? uiText("ui.as_of_9a15133b55", { arg0: String(formatDate(vehicle.mileage_updated_at)) }) : ""}` : null],
    // Owner-confirmed configuration (plan 23.2): swapped or converted parts are labeled so they never read as factory equipment.
    [uiText("ui.configuration_b332c3492d"), vehicle?.configuration_type === "custom_build" ? uiText("ui.custom_build_4a2a5141b7") : vehicle?.configuration_type === "modified" ? uiText("ui.modified_e8ce5dcaf4") : null],
    [uiText("ui.engine_8e75ebbdb2"), vehicle?.engine ? `${vehicle.engine}${vehicle.engine_original === false ? " (swapped)" : ""}` : vehicle?.engine_original === false ? uiText("ui.swapped_5fa27c7f9b") : null],
    [uiText("ui.transmission_3e10134259"), vehicle?.transmission ? `${vehicle.transmission}${vehicle.transmission_original === false ? " (swapped)" : ""}` : vehicle?.transmission_original === false ? uiText("ui.swapped_5fa27c7f9b") : null],
    [uiText("ui.drivetrain_203e886158"), vehicle?.drivetrain ? `${vehicle.drivetrain}${vehicle.drivetrain_original === false ? " (converted)" : ""}` : vehicle?.drivetrain_original === false ? uiText("ui.converted_2c037da8d3") : null],
    [uiText("ui.body_style_191c24bf12"), vehicle?.body_style],
  ].filter((row): row is [string, string | number] => row[1] != null && row[1] !== "");
  // With a factory record the build fields move to the comparison table.
  const factorySpec = vehicle ? parseFactorySpec(vehicle.factory_spec) : null;
  const visibleSpecs = factorySpec
    ? specs.filter(([key]) => ![uiText("ui.engine_8e75ebbdb2"), uiText("ui.transmission_3e10134259"), uiText("ui.drivetrain_203e886158"), uiText("ui.body_style_191c24bf12"), uiText("ui.trim_aaa5478b26")].includes(key))
    : specs;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-32 pt-8 sm:px-6 lg:px-8 lg:pb-16">
      <Link href="/marketplace" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface">
        <ArrowLeft className="h-4 w-4" />{uiText("ui.marketplace_c608981d8d")}</Link>

      {!isPublic ? (
        <div className="mb-5 rounded-2xl bg-surface-container px-5 py-3 text-sm text-on-surface-variant ghost-border">{uiText("ui.this_listing_is_29bbb379fd")}<strong>{LISTING_STATUS_LABELS[listing.status].toLowerCase()}</strong>{uiText("ui.and_only_you_can_see_it_b3c9ff444b")}</div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1.35fr_0.85fr] lg:items-start">
        <div className="min-w-0 space-y-6">
          {/* 1. Gallery */}
          <ListingGallery photos={listing.photos} alt={label || listing.title} canReport={Boolean(viewerId && !isOwner)} />

          {/* 2. Price, vehicle, mileage, region, seller type */}
          <section className="rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
            <div className="flex flex-wrap items-center gap-2">
              {listing.status === "pending" ? <Badge className="bg-warning/15 text-on-surface hover:bg-warning/15">{uiText("ui.sale_pending_22fc610c46")}</Badge> : null}
              {listing.inspection_summary ? (
                <Badge className={`gap-1.5 hover:bg-teal/10 ${inspectionAge(listing.inspection_summary.inspected_at).stale ? "bg-warning/15 text-on-surface" : "bg-teal/10 text-teal"}`}>
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  {listing.inspection_summary.scope === "dents_tires" ? uiText("ui.dents_tires_limited_5ea0898c43") : uiText("ui.complete_143b270a32")}{uiText("ui.inspection_93d87894ad")}{inspectionAge(listing.inspection_summary.inspected_at).label}
                </Badge>
              ) : null}
            </div>
            <p className="mt-3 font-heading text-4xl font-black tracking-tight text-primary">{formatCurrency(listing.asking_price_cents)}</p>
            <h1 className="mt-2 break-words font-heading text-2xl font-extrabold tracking-tight text-on-surface">{listing.title}</h1>
            {label ? <p className="mt-1 text-sm text-on-surface-variant">{label}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {vehicle?.mileage != null ? <Pill><Gauge className="h-3 w-3" />{formatMileage(vehicle.mileage)}{uiText("ui.mi_3074dbe604")}</Pill> : null}
              {listing.location ? <Pill><MapPin className="h-3 w-3" />{listing.location}</Pill> : null}
              <Pill><Calendar className="h-3 w-3" />{uiText("ui.listed_5aadd10d19")}{formatDate(listing.created_at)}</Pill>
              <Pill>{listing.seller_type === "technician" ? <Wrench className="h-3 w-3" /> : null}{SELLER_TYPE_LABELS[listing.seller_type]}</Pill>
            </div>

            {/* 3. Save and Share */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {!isOwner && viewerId ? <ListingSaveButton listingId={listing.id} initialSaved={listing.saved_by_viewer} variant="inline" /> : null}
              {viewerId ? <SavedCollectionButton entityType="listing" entityId={listing.id} /> : null}
              {isPublic ? <ShareButton path={path} title={uiText("ui.perfectppi_marketplace_9eb448db50", { arg0: String(listing.title) })} /> : null}
              {!isOwner && viewerId ? <ExtendedReportControl entityType="listing" entityId={listing.id} label={uiText("ui.listing_fc7f1aa205")} /> : null}
            </div>
          </section>

          {/* 4. Inspection card: the seller-shared, redacted report (plan 25.3) */}
          <section className="rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight">
                <ClipboardCheck className="h-5 w-5 text-teal" />{uiText("ui.inspection_6e4fa13da4")}</h2>
              {isOwner ? (
                <Link href={`/dashboard/listings/${listing.id}/inspection`} className="text-xs font-bold text-primary">
                  {listing.inspection_report ? uiText("ui.manage_sharing_1113464419") : uiText("ui.share_an_inspection_a8e1649bb1")}
                </Link>
              ) : null}
            </div>
            {listing.inspection_report ? (
              <div className="mt-4">
                <InspectionReportCard report={listing.inspection_report} />
                {isOwner ? (
                  <p className="mt-3 text-xs text-on-surface-variant">{uiText("ui.buyers_see_exactly_this_9fb69d1548")}<Link href={`/dashboard/ppi/${listing.inspection_report.request_id}`} className="font-semibold text-primary">{uiText("ui.open_your_full_report_7486cdec5f")}</Link>.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-on-surface-variant">
                {isOwner
                  ? uiText("ui.you_have_not_shared_an_inspection_on_this_li_9f3b003849")
                  : uiText("ui.the_seller_has_not_shared_a_perfectppi_inspe_9df30757d9", { arg0: String(canContact ? uiText("ui.you_can_request_an_independent_one_below_2e2e5671ba") : "") })}
              </p>
            )}
          </section>

          {/* 5. Description and specifications */}
          <section className="rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
            <h2 className="font-heading text-lg font-extrabold tracking-tight">{uiText("ui.condition_description_fa03df9b78")}</h2>
            {listing.description ? (
              <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-on-surface">{listing.description}</p>
            ) : (
              <p className="mt-3 text-sm text-on-surface-variant">{uiText("ui.the_seller_has_not_added_a_description_yet_4461e6cfda")}</p>
            )}
            {visibleSpecs.length > 0 ? (
              <dl className="mt-5 grid gap-x-6 gap-y-2 border-t border-outline-variant/40 pt-4 text-sm sm:grid-cols-2">
                {visibleSpecs.map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4">
                    <dt className="text-on-surface-variant">{key}</dt>
                    <dd className="text-right font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {vehicle && factorySpec ? (
              <div className="mt-5 border-t border-outline-variant/40 pt-4">
                <h3 className="mb-2 text-sm font-bold">{uiText("ui.factory_spec_vs_current_build_b0fd096fdc")}</h3>
                <FactorySpecComparison
                  spec={factorySpec}
                  current={{
                    engine: vehicle.engine, transmission: vehicle.transmission, drivetrain: vehicle.drivetrain,
                    body_style: vehicle.body_style, trim: vehicle.trim,
                    engine_original: vehicle.engine_original, transmission_original: vehicle.transmission_original, drivetrain_original: vehicle.drivetrain_original,
                  }}
                  ownerView={isOwner}
                  compact
                />
              </div>
            ) : null}
          </section>

          {/* 6. Modifications and maintenance highlights, labeled by source */}
          {listing.highlights.length > 0 ? (
            <section className="rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
              <h2 className="font-heading text-lg font-extrabold tracking-tight">{uiText("ui.modifications_maintenance_309ae6ce29")}</h2>
              <p className="mt-1 text-xs text-on-surface-variant">{uiText("ui.published_by_the_owner_from_this_vehicle_s_p_a2b71e2ba8")}</p>
              <ul className="mt-4 divide-y divide-outline-variant/40">
                {listing.highlights.map((item) => (
                  <li key={`${item.source}-${item.id}`} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold">{item.title}</p>
                      {item.detail ? <p className="text-xs text-on-surface-variant">{item.detail}</p> : null}
                    </div>
                    <div className="shrink-0 text-right text-xs text-on-surface-variant">
                      <span className="block rounded-full bg-surface-container px-2 py-0.5 font-semibold">{item.source === "build_journal" ? uiText("ui.build_journal_18179f38e8") : uiText("ui.maintenance_log_eb17bf709a")}</span>
                      {item.date ? <span className="mt-1 block">{formatDate(item.date)}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
              {vehicle ? (
                <Link href={`/vehicle/${vehicle.id}?tab=build`} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">{uiText("ui.full_vehicle_passport_7c4d01d2cc")}<ArrowRight className="h-3 w-3" />
                </Link>
              ) : null}
            </section>
          ) : null}

          {/* 8. Safety guidance */}
          <section className="rounded-[1.5rem] bg-surface-container p-6 ghost-border">
            <h2 className="flex items-center gap-2 font-heading text-base font-extrabold tracking-tight">
              <ShieldAlert className="h-4 w-4 text-warning" />{uiText("ui.buy_safely_d16092ea50")}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-on-surface-variant">
              <li>{uiText("ui.keep_conversations_in_perfectppi_messages_ne_8a21fd7719")}</li>
              <li>{uiText("ui.see_the_vehicle_and_the_title_in_person_and__2a94e188b6")}</li>
              <li>{uiText("ui.an_inspection_describes_a_date_in_the_past_r_0f1fd288ac")}</li>
              <li>{uiText("ui.perfectppi_never_asks_for_payment_through_me_95e5fd0342")}</li>
            </ul>
          </section>
        </div>

        {/* Right column: actions (desktop) and seller card */}
        <aside className="space-y-6 lg:sticky lg:top-24">
          {isOwner ? (
            <ListingManagePanel listingId={listing.id} status={listing.status} returnTo={path} error={query.manage_error} />
          ) : (
            <div className="hidden rounded-2xl bg-surface-container p-5 ghost-border lg:block">
              <ActionForms listing={listing} viewerId={viewerId} canContact={canContact} path={path} query={query} />
            </div>
          )}

          {/* 7. Seller card */}
          <section className="rounded-2xl bg-surface-container-lowest p-5 shadow-sm ghost-border">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{uiText("ui.seller_01498fa31d")}</p>
            <div className="mt-3 flex items-center gap-3">
              <Avatar className="h-11 w-11">
                <AvatarImage src={seller?.avatar_url ?? ""} />
                <AvatarFallback className="text-xs">{getInitials(seller?.display_name ?? seller?.username ?? uiText("ui.s_8de0b3c47f"))}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{seller?.display_name ?? seller?.username ?? uiText("ui.perfectppi_member_99bd607db6")}</p>
                <p className="text-xs text-on-surface-variant">{SELLER_TYPE_LABELS[listing.seller_type]}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-on-surface-variant">
              {listing.seller_history.active_count}{uiText("ui.active_listing_b40a4597ae")}{listing.seller_history.active_count === 1 ? "" : uiText("ui.s_043a718774")} · {listing.seller_history.sold_count}{uiText("ui.sold_on_perfectppi_5d09cb5f12")}{listing.seller_history.first_listed_at ? uiText("ui.selling_since_fa5fe22414", { arg0: String(formatDate(listing.seller_history.first_listed_at)) }) : ""}
            </p>
            {seller?.is_public && seller.username ? (
              <Link href={sharePath({ kind: "profile", username: seller.username })} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">{uiText("ui.view_profile_d4788f256f")}<ArrowRight className="h-3 w-3" />
              </Link>
            ) : (
              <p className="mt-3 text-xs text-on-surface-variant">{uiText("ui.this_member_s_profile_is_private_54360adcbc")}</p>
            )}
            {vehicle ? (
              <Link href={`/vehicle/${vehicle.id}`} className="mt-2 block text-xs font-bold text-primary">{uiText("ui.vehicle_passport_rarr_6d11903145")}</Link>
            ) : null}
          </section>
        </aside>
      </div>

      {/* 9. Sticky actions on small screens */}
      {!isOwner ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant/40 bg-surface-container-lowest/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto max-w-5xl">
            <ActionForms listing={listing} viewerId={viewerId} canContact={canContact} path={path} query={query} compact />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1 text-xs font-bold text-on-surface-variant ghost-border">{children}</span>;
}

function ActionForms({
  listing,
  viewerId,
  canContact,
  path,
  query,
  compact = false,
}: {
  listing: Awaited<ReturnType<typeof getMarketplaceListingDetail>> & object;
  viewerId: string | null;
  canContact: boolean;
  path: string;
  query: { contact_error?: string; inspection_error?: string; inspection_requested?: string };
  compact?: boolean;
}) {
  if (!viewerId) {
    return (
      <div className={compact ? "flex items-center justify-between gap-3" : "space-y-3"}>
        <p className="text-xs text-on-surface-variant">{uiText("ui.sign_in_to_message_the_seller_or_request_an__5b3b20132d")}</p>
        <Link href={`/login?redirect=${encodeURIComponent(path)}`} className="shrink-0 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">{uiText("ui.sign_in_bfd402b2f6")}</Link>
      </div>
    );
  }
  if (!canContact) {
    return <p className="text-xs text-on-surface-variant">{uiText("ui.this_listing_is_no_longer_accepting_inquirie_ef9af5bd98")}</p>;
  }
  return (
    <div className={compact ? "flex gap-2" : "space-y-3"}>
      <form action={contactSellerFromListing} className={compact ? "flex-1" : undefined}>
        <input type="hidden" name="listing_id" value={listing.id} />
        <input type="hidden" name="vehicle_id" value={listing.vehicle_id} />
        <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:opacity-90">
          <MessageSquare className="h-4 w-4" />{uiText("ui.message_seller_21fc80c704")}</button>
      </form>
      {listing.inspection_request ? (
        <Link href={`/dashboard/ppi/${listing.inspection_request.request_id}`} className={`flex items-center justify-center gap-2 rounded-xl bg-teal/10 px-4 py-3 text-center text-xs font-bold text-teal ghost-border ${compact ? "flex-1" : ""}`}>{uiText("ui.inspection_af4bbae008")}{listing.inspection_request.status.replaceAll("_", " ")}
        </Link>
      ) : listing.status === "active" ? (
        <form action={requestMarketplaceInspectionFromListing} className={compact ? "flex-1" : undefined}>
          <input type="hidden" name="listing_id" value={listing.id} />
          <input type="hidden" name="vehicle_id" value={listing.vehicle_id} />
          <input type="hidden" name="scope" value="complete" />
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary px-4 py-3 text-sm font-bold text-primary hover:bg-primary/5">
            <ClipboardCheck className="h-4 w-4" />{uiText("ui.request_inspection_7ad098f214")}</button>
        </form>
      ) : null}
      {!compact ? (
        <>
          <p className="text-[11px] text-on-surface-variant">{uiText("ui.opens_your_existing_thread_with_this_seller__d8fd599ae7")}</p>
          {query.inspection_requested ? <p className="text-xs font-semibold text-teal">{uiText("ui.your_inspection_request_was_sent_d32b1335db")}</p> : null}
          {query.inspection_error ? <p className="break-words text-xs font-semibold text-destructive">{query.inspection_error}</p> : null}
          {query.contact_error ? <p className="break-words text-xs font-semibold text-destructive">{query.contact_error}</p> : null}
        </>
      ) : null}
    </div>
  );
}
