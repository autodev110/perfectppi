import { getMyProfile } from "@/features/profiles/queries";
import { getMyVehicles } from "@/features/vehicles/queries";
import { getMyPpiRequestCount } from "@/features/ppi/queries";
import { getMyWarrantyOpportunities } from "@/features/warranty/queries";
import { getConversations } from "@/features/messages/queries";
import { getMyMarketplaceListings } from "@/features/marketplace/queries";
import {
  Car,
  ClipboardCheck,
  Plus,
  ArrowRight,
  Award,
  Newspaper,
  Tag,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCurrency } from "@/lib/utils/formatting";

export default async function DashboardPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/login");

  const [vehicles, inspectionCount, warrantyOpportunities, conversations, myListings] =
    await Promise.all([
      getMyVehicles(),
      getMyPpiRequestCount(),
      getMyWarrantyOpportunities(3),
      getConversations(3),
      getMyMarketplaceListings(),
    ]);

  return (
    <div className="space-y-12">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-on-surface mb-2">
            Hello{profile.display_name ? `, ${profile.display_name}` : ""}
          </h1>
          <p className="text-on-surface-variant font-medium">
            Welcome back to your automotive ledger. Everything is in order.
          </p>
        </div>
        <div className="flex gap-4">
          <Link
            href="/dashboard/vehicles/new"
            className="bg-surface-container-lowest text-on-surface-variant font-semibold px-6 py-3 rounded-xl shadow-sm hover:shadow-md transition-all flex items-center gap-2 border border-outline-variant/20"
          >
            <Plus className="h-4 w-4" />
            Add Vehicle
          </Link>
          <Link
            href="/dashboard/ppi/new"
            className="bg-primary text-primary-foreground font-semibold px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
          >
            <ClipboardCheck className="h-4 w-4" />
            Start New Inspection
          </Link>
        </div>
      </header>

      {/* Stats — Asymmetric Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <div className="md:col-span-1 bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">
            Fleet Status
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h3 className="text-4xl font-black text-on-surface leading-none">
                {String(vehicles.length).padStart(2, "0")}
              </h3>
              <p className="text-sm font-medium text-on-surface-variant mt-1">
                Registered Vehicles
              </p>
            </div>
            <div className="bg-secondary-container p-2 rounded-lg">
              <Car className="h-5 w-5 text-on-secondary-container" />
            </div>
          </div>
        </div>

        <div className="md:col-span-1 bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4">
            Inspections
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h3 className="text-4xl font-black text-on-surface leading-none">
                {String(inspectionCount).padStart(2, "0")}
              </h3>
              <p className="text-sm font-medium text-on-surface-variant mt-1">
                Total Inspections
              </p>
            </div>
            <div className="bg-tertiary-container p-2 rounded-lg">
              <ClipboardCheck className="h-5 w-5 text-on-tertiary-container" />
            </div>
          </div>
        </div>

        <div className="md:col-span-2 bg-primary-container p-6 rounded-xl shadow-lg flex flex-col justify-between text-white">
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary-fixed-dim">
              Inspection Coverage
            </p>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-bold text-white">
              {inspectionCount > 0 ? "Active" : "Get Started"}
            </h3>
            <p className="text-xs mt-1 text-primary-fixed-dim">
              {inspectionCount > 0
                ? "Your vehicles are covered by PerfectPPI inspections"
                : "Start your first inspection to begin building your vehicle ledger"}
            </p>
          </div>
        </div>
      </section>

      {/* Parent Platform Shortcuts */}
      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/dashboard/posts/new"
          className="group rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary-container text-on-secondary-container">
            <Newspaper className="h-5 w-5" />
          </div>
          <p className="font-heading text-xl font-extrabold tracking-tight text-on-surface">
            Create Community Post
          </p>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            Share a public vehicle, active listing, or inspection discussion in the new community feed.
          </p>
          <span className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-on-tertiary-container group-hover:gap-3 transition-all">
            Open Posts
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>

        <Link
          href="/dashboard/listings/new"
          className="group rounded-2xl border border-outline-variant/10 bg-primary-container p-6 text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
        >
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-white">
            <Tag className="h-5 w-5" />
          </div>
          <p className="font-heading text-xl font-extrabold tracking-tight text-white">
            Publish Marketplace Listing
          </p>
          <p className="mt-2 text-sm leading-relaxed text-primary-fixed-dim">
            Turn a public vehicle profile into a buyer-facing marketplace listing with real vehicle context.
          </p>
          <span className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary-fixed-dim group-hover:gap-3 transition-all">
            Open Listings
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      </section>

      {/* Activity Widgets */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Recent Messages */}
        <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="bg-secondary-container p-1.5 rounded-lg">
                <MessageSquare className="h-4 w-4 text-on-secondary-container" />
              </div>
              <h3 className="font-bold text-sm">Messages</h3>
            </div>
            <Link href="/dashboard/messages" className="text-xs font-bold text-on-tertiary-container">
              View all →
            </Link>
          </div>
          {conversations.length === 0 ? (
            <p className="text-xs text-on-surface-variant">No conversations yet.</p>
          ) : (
            <ul className="space-y-2">
              {conversations.map((convo) => {
                const other = convo.other_participants[0];
                return (
                  <li key={convo.id}>
                    <Link
                      href={`/dashboard/messages/${convo.id}`}
                      className="block rounded-lg p-2 hover:bg-surface-container transition-colors"
                    >
                      <p className="text-sm font-semibold truncate">
                        {other?.display_name ?? other?.username ?? "User"}
                      </p>
                      {convo.last_message && (
                        <p className="text-xs text-on-surface-variant truncate">
                          {convo.last_message.content}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Warranty Opportunities */}
        <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="bg-teal/10 p-1.5 rounded-lg">
                <ShieldCheck className="h-4 w-4 text-teal" />
              </div>
              <h3 className="font-bold text-sm">VSC Offers</h3>
            </div>
            <Link href="/dashboard/warranty" className="text-xs font-bold text-on-tertiary-container">
              View all →
            </Link>
          </div>
          {warrantyOpportunities.length === 0 ? (
            <p className="text-xs text-on-surface-variant">No active VSC offers.</p>
          ) : (
            <ul className="space-y-2">
              {warrantyOpportunities.map((opp) => {
                const vehicleName = opp.vehicle
                  ? [opp.vehicle.year, opp.vehicle.make, opp.vehicle.model].filter(Boolean).join(" ")
                  : "Vehicle";
                const lowestPlan = opp.plans.sort((a, b) => a.price_cents - b.price_cents)[0];
                return (
                  <li key={opp.id}>
                    <Link
                      href={`/dashboard/warranty/${opp.id}`}
                      className="block rounded-lg p-2 hover:bg-surface-container transition-colors"
                    >
                      <p className="text-sm font-semibold truncate">{vehicleName}</p>
                      {lowestPlan && (
                        <p className="text-xs text-on-surface-variant">
                          From {formatCurrency(lowestPlan.price_cents)}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* My Active Listings */}
        <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="bg-primary-container/30 p-1.5 rounded-lg">
                <Tag className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-bold text-sm">My Listings</h3>
            </div>
            <Link href="/dashboard/listings" className="text-xs font-bold text-on-tertiary-container">
              View all →
            </Link>
          </div>
          {myListings.length === 0 ? (
            <p className="text-xs text-on-surface-variant">No active listings.</p>
          ) : (
            <ul className="space-y-2">
              {myListings.slice(0, 3).map((listing) => {
                const vehicleName = listing.vehicle
                  ? [listing.vehicle.year, listing.vehicle.make, listing.vehicle.model].filter(Boolean).join(" ")
                  : listing.title ?? "Vehicle";
                return (
                  <li key={listing.id}>
                    <Link
                      href={`/vehicle/${listing.vehicle_id}?tab=marketplace`}
                      className="block rounded-lg p-2 hover:bg-surface-container transition-colors"
                    >
                      <p className="text-sm font-semibold truncate">{vehicleName}</p>
                      <p className="text-xs text-on-surface-variant">
                        {formatCurrency(listing.asking_price_cents)} · {listing.status}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Vehicle Portfolio */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-extrabold tracking-tight">
            Your Portfolio
          </h2>
          <Link
            href="/dashboard/vehicles"
            className="text-sm font-bold text-on-tertiary-container flex items-center gap-1"
          >
            View All <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {vehicles.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl p-12 text-center shadow-sm border border-outline-variant/10">
            <Car className="h-12 w-12 text-on-surface-variant/30 mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">No vehicles yet</h3>
            <p className="text-sm text-on-surface-variant mb-6">
              Add your first vehicle to get started with inspections.
            </p>
            <Link
              href="/dashboard/vehicles/new"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold text-sm"
            >
              <Plus className="h-4 w-4" />
              Add Vehicle
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {vehicles.slice(0, 4).map((vehicle) => (
              <Link
                key={vehicle.id}
                href={`/dashboard/vehicles/${vehicle.id}`}
                className="group bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-outline-variant/10 flex flex-col md:flex-row"
              >
                <div className="w-full md:w-2/5 relative h-56 md:h-auto bg-surface-container flex items-center justify-center overflow-hidden">
                  {vehicle.vehicle_media?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={
                        vehicle.vehicle_media.find((media) => media.is_primary)?.url ??
                        vehicle.vehicle_media[0].url
                      }
                      alt={`${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim()}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <Car className="h-16 w-16 text-on-surface-variant/20 group-hover:scale-110 transition-transform duration-500" />
                  )}
                </div>
                <div className="flex-1 p-8 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-on-surface">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </h3>
                      <p className="text-xs font-mono text-on-surface-variant uppercase mt-1">
                        VIN: {vehicle.vin ? `${vehicle.vin.slice(0, 11)}*****` : "Not provided"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-400/20 bg-slate-400/10">
                      <Award className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">
                        {vehicle.visibility === "public" ? "Public" : "Private"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-auto pt-4 border-t border-outline-variant/10">
                    <button className="w-full py-3 bg-secondary-container text-on-secondary-container rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors">
                      View Details
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
