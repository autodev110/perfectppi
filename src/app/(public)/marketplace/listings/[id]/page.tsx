import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMarketplaceListingDetail, getMarketplaceListing } from "@/features/marketplace/queries";
import { contactSellerFromListing, requestMarketplaceInspectionFromListing } from "@/features/marketplace/actions";
import { getCurrentSocialProfileId } from "@/features/social/relationships";
import { ListingGallery } from "@/components/shared/listing-gallery";
import { ListingManagePanel } from "@/components/shared/listing-manage-panel";
import { ListingSaveButton } from "@/components/shared/listing-save-button";
import { ShareButton } from "@/components/shared/share-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatMileage, getInitials } from "@/lib/utils/formatting";
import { NEUTRAL_SHARE_CARD, shareCardTitle, sharePath } from "@/lib/share/links";
import { LISTING_STATUS_LABELS, isListingPublic } from "@/lib/marketplace/listing-status";
import { SELLER_TYPE_LABELS } from "@/lib/marketplace/filters";
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
  const specs = [
    ["Year", vehicle?.year],
    ["Make", vehicle?.make],
    ["Model", vehicle?.model],
    ["Trim", vehicle?.trim],
    ["Mileage", vehicle?.mileage != null ? `${formatMileage(vehicle.mileage)} mi${vehicle.mileage_updated_at ? ` (as of ${formatDate(vehicle.mileage_updated_at)})` : ""}` : null],
    ["Transmission", vehicle?.transmission],
    ["Drivetrain", vehicle?.drivetrain],
    ["Body style", vehicle?.body_style],
  ].filter((row): row is [string, string | number] => row[1] != null && row[1] !== "");

  return (
    <div className="mx-auto max-w-5xl px-4 pb-32 pt-8 sm:px-6 lg:px-8 lg:pb-16">
      <Link href="/marketplace" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-on-surface">
        <ArrowLeft className="h-4 w-4" />Marketplace
      </Link>

      {!isPublic ? (
        <div className="mb-5 rounded-2xl bg-surface-container px-5 py-3 text-sm text-on-surface-variant ghost-border">
          This listing is <strong>{LISTING_STATUS_LABELS[listing.status].toLowerCase()}</strong> and only you can see it.
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1.35fr_0.85fr] lg:items-start">
        <div className="min-w-0 space-y-6">
          {/* 1. Gallery */}
          <ListingGallery photos={listing.photos} alt={label || listing.title} />

          {/* 2. Price, vehicle, mileage, region, seller type */}
          <section className="rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
            <div className="flex flex-wrap items-center gap-2">
              {listing.status === "pending" ? <Badge className="bg-warning/15 text-on-surface hover:bg-warning/15">Sale pending</Badge> : null}
              {listing.inspection_summary ? (
                <Badge className="gap-1.5 bg-teal/10 text-teal hover:bg-teal/10">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  {listing.inspection_summary.scope === "dents_tires" ? "Dents & Tires" : "Complete"} inspection · {formatDate(listing.inspection_summary.inspected_at)}
                </Badge>
              ) : null}
            </div>
            <p className="mt-3 font-heading text-4xl font-black tracking-tight text-primary">{formatCurrency(listing.asking_price_cents)}</p>
            <h1 className="mt-2 break-words font-heading text-2xl font-extrabold tracking-tight text-on-surface">{listing.title}</h1>
            {label ? <p className="mt-1 text-sm text-on-surface-variant">{label}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {vehicle?.mileage != null ? <Pill><Gauge className="h-3 w-3" />{formatMileage(vehicle.mileage)} mi</Pill> : null}
              {listing.location ? <Pill><MapPin className="h-3 w-3" />{listing.location}</Pill> : null}
              <Pill><Calendar className="h-3 w-3" />Listed {formatDate(listing.created_at)}</Pill>
              <Pill>{listing.seller_type === "technician" ? <Wrench className="h-3 w-3" /> : null}{SELLER_TYPE_LABELS[listing.seller_type]}</Pill>
            </div>

            {/* 3. Save and Share */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {!isOwner && viewerId ? <ListingSaveButton listingId={listing.id} initialSaved={listing.saved_by_viewer} variant="inline" /> : null}
              {isPublic ? <ShareButton path={path} title={`${listing.title} · PerfectPPI Marketplace`} /> : null}
            </div>
          </section>

          {/* 4. Inspection card */}
          <section className="rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
            <h2 className="flex items-center gap-2 font-heading text-lg font-extrabold tracking-tight">
              <ClipboardCheck className="h-5 w-5 text-teal" />Inspection
            </h2>
            {listing.inspection_summary ? (
              <div className="mt-3 space-y-2 text-sm">
                <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
                  <div><dt className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Scope</dt><dd className="font-semibold">{listing.inspection_summary.scope === "dents_tires" ? "Dents & Tires" : "Complete inspection"}</dd></div>
                  <div><dt className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Inspected</dt><dd className="font-semibold">{formatDate(listing.inspection_summary.inspected_at)}</dd></div>
                  <div><dt className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Performed by</dt><dd className="font-semibold">{listing.inspection_summary.performed_by}</dd></div>
                </dl>
                <p className="text-xs text-on-surface-variant">
                  Findings describe the vehicle on that date and are not a guarantee of its condition today. A limited scope covers only what it names.
                  {isOwner ? (
                    <> <Link href={`/dashboard/ppi/${listing.inspection_summary.request_id}`} className="font-semibold text-primary">Open your full report</Link>.</>
                  ) : (
                    <> The full report, technician notes, VIN, and private media are not shared publicly.</>
                  )}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-on-surface-variant">
                No PerfectPPI inspection is on record for this vehicle.{canContact ? " You can request an independent one below." : ""}
              </p>
            )}
          </section>

          {/* 5. Description and specifications */}
          <section className="rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
            <h2 className="font-heading text-lg font-extrabold tracking-tight">Condition &amp; description</h2>
            {listing.description ? (
              <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-on-surface">{listing.description}</p>
            ) : (
              <p className="mt-3 text-sm text-on-surface-variant">The seller has not added a description yet.</p>
            )}
            {specs.length > 0 ? (
              <dl className="mt-5 grid gap-x-6 gap-y-2 border-t border-outline-variant/40 pt-4 text-sm sm:grid-cols-2">
                {specs.map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-4">
                    <dt className="text-on-surface-variant">{key}</dt>
                    <dd className="text-right font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>

          {/* 6. Modifications and maintenance highlights, labeled by source */}
          {listing.highlights.length > 0 ? (
            <section className="rounded-[1.5rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
              <h2 className="font-heading text-lg font-extrabold tracking-tight">Modifications &amp; maintenance</h2>
              <p className="mt-1 text-xs text-on-surface-variant">Published by the owner from this vehicle&rsquo;s passport. Not verified by PerfectPPI.</p>
              <ul className="mt-4 divide-y divide-outline-variant/40">
                {listing.highlights.map((item) => (
                  <li key={`${item.source}-${item.id}`} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold">{item.title}</p>
                      {item.detail ? <p className="text-xs text-on-surface-variant">{item.detail}</p> : null}
                    </div>
                    <div className="shrink-0 text-right text-xs text-on-surface-variant">
                      <span className="block rounded-full bg-surface-container px-2 py-0.5 font-semibold">{item.source === "build_journal" ? "Build journal" : "Maintenance log"}</span>
                      {item.date ? <span className="mt-1 block">{formatDate(item.date)}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
              {vehicle ? (
                <Link href={`/vehicle/${vehicle.id}?tab=build`} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">
                  Full vehicle passport<ArrowRight className="h-3 w-3" />
                </Link>
              ) : null}
            </section>
          ) : null}

          {/* 8. Safety guidance */}
          <section className="rounded-[1.5rem] bg-surface-container p-6 ghost-border">
            <h2 className="flex items-center gap-2 font-heading text-base font-extrabold tracking-tight">
              <ShieldAlert className="h-4 w-4 text-warning" />Buy safely
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-on-surface-variant">
              <li>Keep conversations in PerfectPPI Messages; never send deposits, gift cards, or wire transfers to hold a car.</li>
              <li>See the vehicle and the title in person, and match the VIN on the car to the title before paying.</li>
              <li>An inspection describes a date in the past. Request a new independent one if the last is old or limited in scope.</li>
              <li>PerfectPPI never asks for payment through messages. Report anything that feels off from the seller&rsquo;s profile.</li>
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
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Seller</p>
            <div className="mt-3 flex items-center gap-3">
              <Avatar className="h-11 w-11">
                <AvatarImage src={seller?.avatar_url ?? ""} />
                <AvatarFallback className="text-xs">{getInitials(seller?.display_name ?? seller?.username ?? "S")}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{seller?.display_name ?? seller?.username ?? "PerfectPPI member"}</p>
                <p className="text-xs text-on-surface-variant">{SELLER_TYPE_LABELS[listing.seller_type]}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-on-surface-variant">
              {listing.seller_history.active_count} active listing{listing.seller_history.active_count === 1 ? "" : "s"} · {listing.seller_history.sold_count} sold on PerfectPPI
              {listing.seller_history.first_listed_at ? ` · selling since ${formatDate(listing.seller_history.first_listed_at)}` : ""}
            </p>
            {seller?.is_public && seller.username ? (
              <Link href={sharePath({ kind: "profile", username: seller.username })} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">
                View profile<ArrowRight className="h-3 w-3" />
              </Link>
            ) : (
              <p className="mt-3 text-xs text-on-surface-variant">This member&rsquo;s profile is private.</p>
            )}
            {vehicle ? (
              <Link href={`/vehicle/${vehicle.id}`} className="mt-2 block text-xs font-bold text-primary">Vehicle passport &rarr;</Link>
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
        <p className="text-xs text-on-surface-variant">Sign in to message the seller or request an inspection.</p>
        <Link href={`/login?redirect=${encodeURIComponent(path)}`} className="shrink-0 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign in</Link>
      </div>
    );
  }
  if (!canContact) {
    return <p className="text-xs text-on-surface-variant">This listing is no longer accepting inquiries.</p>;
  }
  return (
    <div className={compact ? "flex gap-2" : "space-y-3"}>
      <form action={contactSellerFromListing} className={compact ? "flex-1" : undefined}>
        <input type="hidden" name="listing_id" value={listing.id} />
        <input type="hidden" name="vehicle_id" value={listing.vehicle_id} />
        <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:opacity-90">
          <MessageSquare className="h-4 w-4" />Message Seller
        </button>
      </form>
      {listing.inspection_request ? (
        <Link href={`/dashboard/ppi/${listing.inspection_request.request_id}`} className={`flex items-center justify-center gap-2 rounded-xl bg-teal/10 px-4 py-3 text-center text-xs font-bold text-teal ghost-border ${compact ? "flex-1" : ""}`}>
          Inspection · {listing.inspection_request.status.replaceAll("_", " ")}
        </Link>
      ) : listing.status === "active" ? (
        <form action={requestMarketplaceInspectionFromListing} className={compact ? "flex-1" : undefined}>
          <input type="hidden" name="listing_id" value={listing.id} />
          <input type="hidden" name="vehicle_id" value={listing.vehicle_id} />
          <input type="hidden" name="scope" value="complete" />
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary px-4 py-3 text-sm font-bold text-primary hover:bg-primary/5">
            <ClipboardCheck className="h-4 w-4" />Request Inspection
          </button>
        </form>
      ) : null}
      {!compact ? (
        <>
          <p className="text-[11px] text-on-surface-variant">Opens your existing thread with this seller, or starts a new one.</p>
          {query.inspection_requested ? <p className="text-xs font-semibold text-teal">Your inspection request was sent.</p> : null}
          {query.inspection_error ? <p className="break-words text-xs font-semibold text-destructive">{query.inspection_error}</p> : null}
          {query.contact_error ? <p className="break-words text-xs font-semibold text-destructive">{query.contact_error}</p> : null}
        </>
      ) : null}
    </div>
  );
}
