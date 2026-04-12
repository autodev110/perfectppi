import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getPublicVehicle,
  getVehiclePpiHistory,
} from "@/features/vehicles/queries";
import { getVehicleActiveListing } from "@/features/marketplace/queries";
import { contactSellerFromListing } from "@/features/marketplace/actions";
import { getPublicVehicleWarrantySnapshot } from "@/features/warranty/queries";
import { createCommunityComment } from "@/features/community/actions";
import { getVehicleDiscussionPosts } from "@/features/community/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatMileage, formatDate, getInitials, formatCurrency } from "@/lib/utils/formatting";
import {
  Car,
  ClipboardCheck,
  Share2,
  Award,
  Calendar,
  Gauge,
  Hash,
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
  searchParams: Promise<{ tab?: string }>;
};

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const vehicle = await getPublicVehicle(id);
  if (!vehicle) return {};

  const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  return {
    title: `${name} — PerfectPPI`,
    description: `View the verified inspection history and details for this ${name} on PerfectPPI.`,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PPI_BADGE = {
  personal: {
    label: "Bronze · Personal",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
  },
  general_tech: {
    label: "Silver · General Tech",
    color: "text-slate-600",
    bg: "bg-slate-50 border-slate-200",
    dot: "bg-slate-400",
  },
  certified_tech: {
    label: "Gold · Certified Tech",
    color: "text-yellow-700",
    bg: "bg-yellow-50 border-yellow-200",
    dot: "bg-yellow-500",
  },
} as const;

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
  const { tab } = await searchParams;
  const activeTab =
    tab === "ppi-history" ||
    tab === "marketplace" ||
    tab === "warranty" ||
    tab === "discussion"
      ? tab
      : "overview";

  const [vehicle, ppiHistory, activeListing, warrantySnapshot, discussionPosts] = await Promise.all([
    getPublicVehicle(id),
    getVehiclePpiHistory(id),
    getVehicleActiveListing(id),
    getPublicVehicleWarrantySnapshot(id),
    getVehicleDiscussionPosts(id),
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
  const latestBadge = latestPpi
    ? PPI_BADGE[latestPpi.ppi_type as keyof typeof PPI_BADGE]
    : null;

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
          {latestBadge && (
            <div
              className={`absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold backdrop-blur-sm bg-white/90 ${latestBadge.color} ${latestBadge.bg}`}
            >
              <Award className="h-3.5 w-3.5" />
              {latestBadge.label}
            </div>
          )}
        </div>

        {/* Info row */}
        <div className="px-7 py-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-on-surface mb-1">
              {vehicleName || "Unknown Vehicle"}
            </h1>
            {vehicle.trim && (
              <p className="text-sm text-on-surface-variant mb-3">{vehicle.trim}</p>
            )}
            {/* Spec pills */}
            <div className="flex flex-wrap gap-2 mt-2">
              {vehicle.mileage != null && (
                <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-surface-container ghost-border text-on-surface-variant">
                  <Gauge className="h-3 w-3" />
                  {formatMileage(vehicle.mileage)} mi
                </span>
              )}
              {vehicle.vin && (
                <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-surface-container ghost-border text-on-surface-variant font-mono">
                  <Hash className="h-3 w-3" />
                  {vehicle.vin}
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

          {/* Owner */}
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

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-surface-container rounded-xl ghost-border mb-6 w-fit">
        {[
          { key: "overview", label: "Overview" },
          { key: "ppi-history", label: `PPI History${ppiHistory.length > 0 ? ` (${ppiHistory.length})` : ""}` },
          { key: "marketplace", label: "Marketplace Listing" },
          { key: "warranty", label: "Warranty Status" },
          { key: "discussion", label: `Posts & Discussion${discussionPosts.length > 0 ? ` (${discussionPosts.length})` : ""}` },
        ].map(({ key, label }) => (
          <Link
            key={key}
            href={key === "overview" ? `/vehicle/${id}` : `/vehicle/${id}?tab=${key}`}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
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
                { label: "Mileage", value: vehicle.mileage != null ? `${formatMileage(vehicle.mileage)} miles` : null },
                { label: "VIN", value: vehicle.vin, mono: true },
              ].filter((f) => f.value).map(({ label, value, mono }) => (
                <div key={label}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                    {label}
                  </p>
                  <p className={`text-sm font-semibold text-on-surface ${mono ? "font-mono" : ""}`}>
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
                  {latestBadge && (
                    <span className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${latestBadge.color} ${latestBadge.bg}`}>
                      <Award className="h-3 w-3" />
                      {latestBadge.label}
                    </span>
                  )}
                </div>
                <Link
                  href={`/vehicle/${id}?tab=ppi-history`}
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
                Get a verified PPI from a certified technician in our network.
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

      {/* ── Marketplace tab ──────────────────────────────────────── */}
      {activeTab === "marketplace" && (
        <div className="bg-surface-container-lowest rounded-[1.25rem] p-6 ghost-border shadow-sm">
          {activeListing ? (
            <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr] md:items-start">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="h-4 w-4 text-on-tertiary-container" />
                  <Badge className="bg-teal/10 text-teal hover:bg-teal/10">
                    Active Listing
                  </Badge>
                </div>
                <h2 className="font-heading text-2xl font-extrabold tracking-tight text-on-surface mb-2">
                  {activeListing.title}
                </h2>
                {activeListing.description ? (
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    {activeListing.description}
                  </p>
                ) : (
                  <p className="text-sm text-on-surface-variant">
                    No seller description has been added yet.
                  </p>
                )}
              </div>

              <div className="rounded-2xl bg-surface-container p-5 ghost-border">
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

                <form action={contactSellerFromListing}>
                  <input type="hidden" name="listing_id" value={activeListing.id} />
                  <input type="hidden" name="vehicle_id" value={id} />
                  <button
                    type="submit"
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 transition-opacity"
                  >
                    Contact Seller
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
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

      {/* ── Warranty tab ─────────────────────────────────────────── */}
      {activeTab === "warranty" && (
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

      {/* ── Discussion tab ───────────────────────────────────────── */}
      {activeTab === "discussion" && (
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
                      <p className="text-xs font-bold text-on-surface">
                        {post.author?.display_name ?? post.author?.username ?? "PerfectPPI user"}
                      </p>
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

                {post.comments.length > 0 && (
                  <div className="space-y-2.5 mb-4">
                    {post.comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded-xl bg-surface-container p-3 ghost-border"
                      >
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <p className="text-[11px] font-bold text-on-surface">
                            {comment.author?.display_name ?? comment.author?.username ?? "PerfectPPI user"}
                          </p>
                          <p className="text-[10px] text-on-surface-variant">
                            {formatDate(comment.created_at)}
                          </p>
                        </div>
                        <p className="text-xs text-on-surface-variant whitespace-pre-wrap">
                          {comment.content}
                        </p>
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

      {/* ── PPI History tab ───────────────────────────────────────── */}
      {activeTab === "ppi-history" && (
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
              const badge = PPI_BADGE[ppi.ppi_type as keyof typeof PPI_BADGE];
              const requester = ppi.requester as { display_name: string | null; username: string | null; avatar_url: string | null } | null;
              const tech = ppi.assigned_tech as { display_name: string | null; username: string | null; avatar_url: string | null } | null;

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
                      {badge && (
                        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${badge.color} ${badge.bg}`}>
                          <Award className="h-3 w-3" />
                          {badge.label}
                        </span>
                      )}
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
                    {tech ? (
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
                    ) : requester ? (
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

                  {/* Share icon */}
                  <button
                    className="flex-shrink-0 w-8 h-8 rounded-lg bg-surface-container ghost-border flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors"
                    aria-label="Share inspection"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
