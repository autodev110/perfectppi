import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getPublicVehicle,
  getVehiclePpiHistory,
} from "@/features/vehicles/queries";
import { getVehicleActiveListing } from "@/features/marketplace/queries";
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
  const { id } = await params;
  const vehicle = await getPublicVehicle(id);
  if (!vehicle) return {};

  const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  // Year/make/model only (plan 23.3, 15.4): never VIN, plate, or location.
  const description = `View available inspection records and details for this ${name} on PerfectPPI.`;
  return {
    title: `${name} — PerfectPPI`,
    description,
    openGraph: { title: `${name} · PerfectPPI`, description, url: `/vehicle/${id}` },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  completed: "Completed",
};

const WARRANTY_STATUS_LABEL: Record<string, string> = {
  not_offered: "Not Offered",
  offered: "Offered",
  viewed: "Viewed",
  selected: "Selected",
  contract_pending: "Contract Pending",
  signed: "Signed",
  payment_pending: "Payment Pending",
  paid: "Paid",
  failed: "Payment Failed",
  cancelled: "Cancelled",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PublicVehiclePage({ params, searchParams }: PageProps) {
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
              {listingInspection.scope === "dents_tires" ? "Dents & Tires" : "Complete"} · {formatDate(listingInspection.inspected_at)}
            </div>
          )}
        </div>

        {/* Info row */}
        <div className="px-7 py-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-on-surface mb-1 break-words">
              {vehicle.nickname || vehicleName || "Unknown Vehicle"}
            </h1>
            {vehicle.nickname && <p className="text-sm text-on-surface-variant mb-1">{vehicleName}</p>}
            {vehicle.trim && (
              <p className="text-sm text-on-surface-variant mb-3">{vehicle.trim}</p>
            )}
            {/* Spec pills */}
            <div className="flex flex-wrap gap-2 mt-2">
              {vehicle.ownership_state === "previously_owned" && (
                <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-surface-container ghost-border text-on-surface-variant">
                  Previously owned{vehicle.sold_at ? ` · ${formatDate(vehicle.sold_at)}` : ""}
                </span>
              )}
              {vehicle.visibility === "friends" && (
                <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-surface-container ghost-border text-on-surface-variant">
                  Friends only
                </span>
              )}
              {vehicle.mileage != null && (
                <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-surface-container ghost-border text-on-surface-variant">
                  <Gauge className="h-3 w-3" />
                  {formatMileage(vehicle.mileage)} mi
                </span>
              )}
              <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-surface-container ghost-border text-on-surface-variant">
                <Calendar className="h-3 w-3" />
                {activeListing
                  ? `Listed ${formatDate(activeListing.created_at)}`
                  : `Profile created ${formatDate(vehicle.created_at)}`}
              </span>
            </div>
          </div>

          {/* Owner + share */}
          <div className="flex flex-shrink-0 flex-col items-end gap-2">
          {vehicle.visibility === "public" ? (
            <ShareButton path={sharePath({ kind: "vehicle", id: vehicle.id })} title={`${vehicleName} · PerfectPPI`} />
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
                  {getInitials(owner.display_name ?? "U")}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xs font-bold text-on-surface">
                  {owner.display_name ?? owner.username ?? "Owner"}
                </p>
                <p className="text-[10px] text-on-surface-variant">View profile</p>
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
          { key: "overview", label: "Overview" },
          { key: "posts", label: `Posts${discussionPosts.length > 0 ? ` (${discussionPosts.length})` : ""}` },
          { key: "build", label: `Build${timelines.build.length > 0 ? ` (${timelines.build.length})` : ""}` },
          { key: "maintenance", label: `Maintenance${timelines.maintenance.length > 0 ? ` (${timelines.maintenance.length})` : ""}` },
          { key: "inspections", label: `Inspections${ppiHistory.length > 0 ? ` (${ppiHistory.length})` : ""}` },
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
            <h2 className="font-heading font-extrabold text-base mb-4 text-on-surface">
              Vehicle Details
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              {[
                { label: "Year", value: vehicle.year?.toString() },
                { label: "Make", value: vehicle.make },
                { label: "Model", value: vehicle.model },
                { label: "Trim", value: vehicle.trim },
                { label: "Engine", value: vehicle.engine },
                { label: "Drivetrain", value: vehicle.drivetrain },
                { label: "Transmission", value: vehicle.transmission },
                { label: "Body style", value: vehicle.body_style },
                { label: "Mileage", value: vehicle.mileage != null ? `${formatMileage(vehicle.mileage)} miles` : null },
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

          {/* Inspection summary */}
          <div className="bg-surface-container-lowest rounded-[1.25rem] p-6 ghost-border shadow-sm">
            <h2 className="font-heading font-extrabold text-base mb-4 text-on-surface">
              Inspection Summary
            </h2>
            {ppiHistory.length === 0 ? (
              <div className="flex items-center gap-3 text-on-surface-variant">
                <ClipboardCheck className="h-5 w-5 opacity-40" />
                <p className="text-sm">
                  No submitted PPI reports are attached to this vehicle yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-on-surface">
                      {ppiHistory.length} inspection{ppiHistory.length !== 1 ? "s" : ""} on record
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      Most recent: {formatDate(latestPpi!.created_at)}
                    </p>
                  </div>
                  {latestPpi && (
                    <span className="ml-auto flex items-center gap-1.5 rounded-xl border border-teal/20 bg-teal/10 px-3 py-1.5 text-xs font-bold text-teal">
                      <ClipboardCheck className="h-3 w-3" />
                      {latestPpi.inspection_scope === "dents_tires" ? "Dents & Tires" : "Complete"}
                    </span>
                  )}
                </div>
                <Link
                  href={`/vehicle/${id}?tab=inspections`}
                  className="flex items-center gap-2 text-xs font-bold text-on-tertiary-container hover:gap-3 transition-all mt-2"
                >
                  View full inspection history
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>

          {/* CTAs */}
          <div className="bg-primary-container rounded-[1.25rem] p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
            <div className="relative z-10">
              <h2 className="font-heading font-extrabold text-base mb-1">
                Request an Inspection
              </h2>
              <p className="text-sm text-primary-fixed-dim mb-5">
                Request a PPI from an available technician and review any
                displayed credential status before assigning the work.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="flex items-center gap-2 bg-white text-primary px-5 py-2.5 rounded-xl text-sm font-bold shadow hover:scale-105 transition-all"
                >
                  <Wrench className="h-4 w-4" />
                  Request Technician PPI
                </Link>
                <Link
                  href="/technicians"
                  className="flex items-center gap-2 bg-white/10 text-white px-5 py-2.5 rounded-xl text-sm font-bold ghost-border hover:bg-white/20 transition-all"
                >
                  <User className="h-4 w-4" />
                  Browse Technicians
                </Link>
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
                    {activeListing.status === "pending" ? "Sale pending" : "Active Listing"}
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
                  <p className="text-sm text-on-surface-variant">
                    No seller description has been added yet.
                  </p>
                )}
                {activeListing.inspection_summary && (
                  <div className="mt-5 rounded-2xl bg-teal/10 p-4 text-sm text-on-surface ghost-border">
                    <div className="flex items-center gap-2 font-bold">
                      <ClipboardCheck className="h-4 w-4 text-teal" />
                      {activeListing.inspection_summary.scope === "dents_tires"
                        ? "Dents & Tires inspection"
                        : "Complete inspection"}
                    </div>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      Inspected {formatDate(activeListing.inspection_summary.inspected_at)} by {activeListing.inspection_summary.performed_by}.
                    </p>
                    <p className="mt-2 text-[11px] text-on-surface-variant">
                      This inspection reflects the vehicle at that time and is not a guarantee of its current condition. Private notes, media, VIN, and the full report are not publicly shared.
                    </p>
                  </div>
                )}
              </div>

              <div className="min-w-0 rounded-2xl bg-surface-container p-5 ghost-border">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                  Asking Price
                </p>
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
                    <Calendar className="h-4 w-4" />
                    Listed {formatDate(activeListing.created_at)}
                  </div>
                </div>

                <Link
                  href={`/marketplace/listings/${activeListing.id}`}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-primary px-5 py-3 text-sm font-bold text-primary hover:bg-primary/5 transition-colors"
                >
                  {activeListing.viewer_is_seller ? "Manage Listing" : "View full listing"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                {activeListing.viewer_is_seller ? null : (
                  <form action={contactSellerFromListing}>
                    <input type="hidden" name="listing_id" value={activeListing.id} />
                    <input type="hidden" name="vehicle_id" value={id} />
                    <button
                      type="submit"
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      Message Seller
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </form>
                )}
                {!activeListing.viewer_is_seller ? (
                  <div className="mt-3">
                    <ListingSaveButton listingId={activeListing.id} initialSaved={activeListing.saved_by_viewer} variant="inline" />
                  </div>
                ) : null}
                {!activeListing.viewer_is_seller && activeListing.inspection_request ? (
                  <div className="mt-3 rounded-xl bg-teal/10 px-4 py-3 text-center text-xs font-bold text-teal ghost-border">
                    Inspection requested · {activeListing.inspection_request.status.replaceAll("_", " ")}
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
                      <ClipboardCheck className="h-4 w-4" />
                      Request Inspection
                    </button>
                  </form>
                ) : null}
                {!activeListing.viewer_is_seller && (
                  <p className="mt-2 text-[11px] text-on-surface-variant">
                    Opens your existing thread with this seller, or starts a new one.
                  </p>
                )}
                {inspectionRequested && (
                  <p className="mt-2 text-xs font-semibold text-teal">
                    Your inspection request was sent.
                  </p>
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
              <p className="font-heading font-bold text-on-surface mb-1">
                This vehicle is not listed for sale
              </p>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto">
                If the owner publishes a marketplace listing, the buyer-facing price and seller notes will appear here.
              </p>
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
                  <p className="font-heading font-extrabold text-on-surface">
                    Vehicle Service Contract Status
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl bg-surface-container p-4 ghost-border">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                      Offer
                    </p>
                    <p className="text-sm font-bold text-on-surface">
                      {WARRANTY_STATUS_LABEL[warrantySnapshot.option.status] ?? warrantySnapshot.option.status}
                    </p>
                    {warrantySnapshot.option.offered_at && (
                      <p className="text-[11px] text-on-surface-variant mt-1">
                        Offered {formatDate(warrantySnapshot.option.offered_at)}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl bg-surface-container p-4 ghost-border">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                      Selected Plan
                    </p>
                    <p className="text-sm font-bold text-on-surface">
                      {warrantySnapshot.order?.plan_name ?? "Not selected"}
                    </p>
                    {warrantySnapshot.order && (
                      <p className="text-[11px] text-on-surface-variant mt-1">
                        {formatCurrency(warrantySnapshot.order.price_cents)}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl bg-surface-container p-4 ghost-border">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                      Payment
                    </p>
                    <p className="text-sm font-bold text-on-surface">
                      {warrantySnapshot.payment
                        ? warrantySnapshot.payment.status === "completed"
                          ? "Paid"
                          : warrantySnapshot.payment.status === "failed"
                            ? "Failed"
                            : warrantySnapshot.payment.status === "refunded"
                              ? "Refunded"
                              : "Pending"
                        : "Not paid"}
                    </p>
                    {warrantySnapshot.payment?.paid_at && (
                      <p className="text-[11px] text-on-surface-variant mt-1">
                        Paid {formatDate(warrantySnapshot.payment.paid_at)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-[1.25rem] p-6 ghost-border shadow-sm">
                <h3 className="font-heading font-extrabold text-sm text-on-surface mb-3">
                  Flow Progress
                </h3>
                <div className="space-y-2.5">
                  {[
                    {
                      icon: Shield,
                      label: "Offer Created",
                      value: !!warrantySnapshot.option,
                      meta: warrantySnapshot.option.created_at,
                    },
                    {
                      icon: Tag,
                      label: "Plan Selected",
                      value: !!warrantySnapshot.order,
                      meta: warrantySnapshot.order?.selected_at ?? null,
                    },
                    {
                      icon: FileSignature,
                      label: "Contract Signed",
                      value: !!warrantySnapshot.contract?.signed_at,
                      meta: warrantySnapshot.contract?.signed_at ?? null,
                    },
                    {
                      icon: CreditCard,
                      label: "Payment Completed",
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
                          {step.meta ? formatDate(step.meta) : "Not reached yet"}
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
              <p className="font-heading font-bold text-on-surface mb-1">
                No vehicle service contract data yet
              </p>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto">
                Warranty status appears once a completed inspection produces coverage options and a contract flow begins.
              </p>
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
              <p className="font-heading font-bold text-on-surface mb-1">No vehicle discussions yet</p>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto mb-5">
                Community posts that reference this vehicle will appear here.
              </p>
              <Button asChild>
                <Link href="/dashboard/posts/new">Create Post</Link>
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
                        {getInitials(post.author?.display_name ?? post.author?.username ?? "U")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-bold text-on-surface">
                          {post.author?.display_name ?? post.author?.username ?? "PerfectPPI user"}
                        </p>
                        {post.post_type === "question" ? (
                          <Badge className="bg-teal/10 text-teal hover:bg-teal/10">
                            {post.accepted_answer_comment_id ? "Solved" : "Question"}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-[10px] text-on-surface-variant">
                        {formatDate(post.created_at)}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/community"
                    className="text-[11px] font-bold text-on-tertiary-container hover:underline"
                  >
                    Open feed
                  </Link>
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
                    {post.comments.map((comment) => (
                      <div
                        key={comment.id}
                        className={`rounded-xl bg-surface-container p-3 ghost-border ${post.accepted_answer_comment_id === comment.id ? "ring-2 ring-teal/30" : ""}`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <p className="text-[11px] font-bold text-on-surface">
                            {comment.author?.display_name ?? comment.author?.username ?? "PerfectPPI user"}
                          </p>
                          <p className="text-[10px] text-on-surface-variant">
                            {formatDate(comment.created_at)}
                          </p>
                        </div>
                        {post.post_type === "question" ? (
                          <AcceptedAnswerControl
                            postId={post.id}
                            commentId={comment.id}
                            accepted={post.accepted_answer_comment_id === comment.id}
                            canManage={post.can_manage_accepted_answer}
                            ownResponse={comment.author_id === post.author_id}
                          />
                        ) : null}
                        <p className="text-xs text-on-surface-variant whitespace-pre-wrap">
                          {comment.content}
                        </p>
                        {post.post_type === "question" ? (
                          <CommunityHelpfulButton
                            commentId={comment.id}
                            initialHelpful={comment.helpful_by_viewer}
                            initialCount={comment.helpful_count}
                            disabled={!comment.can_mark_helpful}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                <form action={createCommunityComment} className="space-y-2.5">
                  <input type="hidden" name="post_id" value={post.id} />
                  <Textarea
                    name="content"
                    rows={3}
                    maxLength={600}
                    placeholder="Add a comment..."
                  />
                  <Button type="submit" size="sm">
                    Comment
                  </Button>
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
              <div><p className="text-sm font-bold">Build updates</p><p className="text-xs text-on-surface-variant">Private subscription. It is never shown as a follower count.</p></div>
              <BuildSubscriptionButton vehicleId={vehicle.id} initialSubscribed={buildSubscribed} />
            </div>
          ) : null}
          <PublicBuildTimeline entries={timelines.build} canSave={!!viewerId} />
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
              <p className="font-heading font-bold text-on-surface mb-1">No inspections yet</p>
              <p className="text-sm text-on-surface-variant">
                Submitted PPI reports will appear here after an inspection is completed.
              </p>
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
                        {ppi.inspection_scope === "dents_tires" ? "Dents & Tires" : "Complete inspection"}
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
                            {getInitials(tech.display_name ?? "T")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-xs font-bold text-on-surface">
                            {tech.display_name ?? "Technician"}
                          </p>
                          <p className="text-[10px] text-on-surface-variant">Inspector</p>
                        </div>
                      </>
                    ) : requester?.is_public ? (
                      <>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={requester.avatar_url ?? ""} />
                          <AvatarFallback className="text-xs">
                            {getInitials(requester.display_name ?? "U")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-xs font-bold text-on-surface">
                            {requester.display_name ?? "Owner"}
                          </p>
                          <p className="text-[10px] text-on-surface-variant">Self-inspection</p>
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

function PublicBuildTimeline({ entries, canSave }: { entries: PublicTimelines["build"]; canSave: boolean }) {
  if (entries.length === 0) {
    return <TimelineEmpty icon={<Wrench className="h-10 w-10" />} title="No shared build entries" message="The owner has not shared any modifications for this vehicle." />;
  }
  return (
    <div className="space-y-4">
      {entries.map((entry) => (
        <article id={`build-${entry.id}`} key={entry.id} className="scroll-mt-24 rounded-[1.25rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">{entry.category}</p><h2 className="mt-1 font-heading text-lg font-extrabold text-on-surface">{entry.title}</h2></div>
            <Badge variant="outline">{entry.status.replaceAll("_", " ")}</Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-on-surface-variant">
            {entry.manufacturer && <span className="rounded-lg bg-surface-container px-3 py-1.5">{entry.manufacturer}{entry.part_number ? ` · ${entry.part_number}` : ""}</span>}
            {entry.installed_on && <span className="rounded-lg bg-surface-container px-3 py-1.5">{formatDate(entry.installed_on)}</span>}
            {entry.mileage != null && <span className="rounded-lg bg-surface-container px-3 py-1.5">{formatMileage(entry.mileage)} mi</span>}
            <span className="rounded-lg bg-surface-container px-3 py-1.5">{entry.fitment_confidence.replaceAll("_", " ")}</span>
          </div>
          {[entry.vehicle_configuration, entry.wheel_size && `Wheels: ${entry.wheel_size}`, entry.wheel_width != null && `Width: ${entry.wheel_width} in`, entry.wheel_offset_mm != null && `Offset: ${entry.wheel_offset_mm} mm`, entry.tire_size && `Tires: ${entry.tire_size}`, entry.suspension_drop && `Drop: ${entry.suspension_drop}`].filter(Boolean).length > 0 && (
            <p className="mt-4 text-sm text-on-surface-variant">{[entry.vehicle_configuration, entry.wheel_size && `Wheels: ${entry.wheel_size}`, entry.wheel_width != null && `Width: ${entry.wheel_width} in`, entry.wheel_offset_mm != null && `Offset: ${entry.wheel_offset_mm} mm`, entry.tire_size && `Tires: ${entry.tire_size}`, entry.suspension_drop && `Drop: ${entry.suspension_drop}`].filter(Boolean).join(" · ")}</p>
          )}
          {entry.public_notes && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-on-surface">{entry.public_notes}</p>}
          {canSave ? <div className="mt-4"><SavedCollectionButton entityType="build" entityId={entry.id} /></div> : null}
          <p className="mt-4 text-[11px] text-on-surface-variant">Owner-reported unless a stronger source is shown. Fitment is not guaranteed.</p>
        </article>
      ))}
    </div>
  );
}

function PublicMaintenanceTimeline({ events }: { events: PublicTimelines["maintenance"] }) {
  if (events.length === 0) {
    return <TimelineEmpty icon={<Wrench className="h-10 w-10" />} title="No shared maintenance" message="The owner has not shared any maintenance records for this vehicle." />;
  }
  return (
    <div className="space-y-4">
      {events.map((event) => (
        <article key={event.id} className="rounded-[1.25rem] bg-surface-container-lowest p-6 shadow-sm ghost-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Maintenance</p><h2 className="mt-1 font-heading text-lg font-extrabold text-on-surface">{event.service_type}</h2></div>
            <span className="text-sm font-semibold text-on-surface-variant">{formatDate(event.serviced_on)}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-on-surface-variant">
            {event.mileage != null && <span className="rounded-lg bg-surface-container px-3 py-1.5">{formatMileage(event.mileage)} mi</span>}
            {event.provider && <span className="rounded-lg bg-surface-container px-3 py-1.5">{event.provider}</span>}
            {event.next_due_on && <span className="rounded-lg bg-surface-container px-3 py-1.5">Next due {formatDate(event.next_due_on)}</span>}
            {event.next_due_mileage != null && <span className="rounded-lg bg-surface-container px-3 py-1.5">Due at {formatMileage(event.next_due_mileage)} mi</span>}
          </div>
          {event.parts_fluids && <p className="mt-4 whitespace-pre-wrap text-sm text-on-surface"><strong>Parts and fluids:</strong> {event.parts_fluids}</p>}
          {event.public_notes && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-on-surface">{event.public_notes}</p>}
          <p className="mt-4 text-[11px] text-on-surface-variant">Owner-reported service record. Private receipts, cost, and notes are not shared.</p>
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
