import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublicProfile, getProfilePublicContent } from "@/features/profiles/queries";
import { getDirectory } from "@/features/technicians/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatMileage, getInitials } from "@/lib/utils/formatting";
import {
  Car,
  MapPin,
  Gauge,
  Award,
  ClipboardCheck,
  Tag,
  MessageSquare,
  ArrowRight,
  Shield,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type PageProps = { params: Promise<{ username: string }> };

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await getPublicProfile(username);
  if (!profile) return {};
  return {
    title: `${profile.display_name ?? profile.username} — PerfectPPI`,
    description: profile.bio ?? `View ${profile.display_name ?? profile.username}'s profile on PerfectPPI.`,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PPI_BADGE = {
  personal:       { label: "Bronze", color: "text-amber-700",  bg: "bg-amber-50 border-amber-200" },
  general_tech:   { label: "Silver", color: "text-slate-600",  bg: "bg-slate-50 border-slate-200" },
  certified_tech: { label: "Gold",   color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
} as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PublicProfilePage({ params }: PageProps) {
  const { username } = await params;
  const profile = await getPublicProfile(username);
  if (!profile) notFound();

  const [content, allTechEntries] = await Promise.all([
    getProfilePublicContent(profile.id),
    profile.role === "technician" ? getDirectory() : Promise.resolve([]),
  ]);

  const tech = profile.role === "technician"
    ? (allTechEntries as Awaited<ReturnType<typeof getDirectory>>).find((t) => t.profile_id === profile.id) ?? null
    : null;

  const { vehicles, listings, posts, ppis } = content;

  return (
    <div className="min-h-screen bg-surface">

      {/* ── Profile header ──────────────────────────────────────── */}
      <section className="px-8 pt-28 pb-10 bg-surface-container-low border-b border-outline-variant/20">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start gap-6">
          <Avatar className="h-20 w-20 flex-shrink-0 ring-4 ring-surface shadow-md">
            <AvatarImage src={profile.avatar_url ?? ""} />
            <AvatarFallback className="text-2xl font-bold">
              {getInitials(profile.display_name ?? profile.username ?? "U")}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="font-heading text-2xl font-extrabold tracking-tight text-on-surface">
                {profile.display_name ?? profile.username}
              </h1>
              {profile.role === "technician" && (
                <Badge className="bg-secondary-container text-on-secondary-container">
                  Technician
                </Badge>
              )}
              {tech && (
                <Badge variant="outline" className="text-xs font-bold capitalize">
                  {tech.certification_level}
                </Badge>
              )}
            </div>
            {profile.username && (
              <p className="text-sm text-on-surface-variant mb-2">@{profile.username}</p>
            )}
            {profile.bio && (
              <p className="text-sm text-on-surface-variant max-w-xl leading-relaxed mb-4">{profile.bio}</p>
            )}

            {/* Stats row */}
            <div className="flex flex-wrap gap-5">
              {vehicles.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm font-bold text-on-surface">
                  <Car className="h-4 w-4 text-on-surface-variant" />
                  {vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""}
                </div>
              )}
              {listings.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm font-bold text-on-surface">
                  <Tag className="h-4 w-4 text-on-surface-variant" />
                  {listings.length} listing{listings.length !== 1 ? "s" : ""}
                </div>
              )}
              {ppis.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm font-bold text-on-surface">
                  <ClipboardCheck className="h-4 w-4 text-on-surface-variant" />
                  {ppis.length} inspection{ppis.length !== 1 ? "s" : ""}
                </div>
              )}
              {tech && (
                <div className="flex items-center gap-1.5 text-sm font-bold text-on-surface">
                  <Shield className="h-4 w-4 text-on-surface-variant" />
                  {tech.total_inspections} completed
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            {tech && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/technicians/${tech.id}`}>
                  View Tech Profile
                </Link>
              </Button>
            )}
            <Button asChild size="sm">
              <Link href={`/dashboard/messages`}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Message
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-8 py-10 space-y-14">

        {/* ── Vehicles ────────────────────────────────────────────── */}
        {vehicles.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-lg font-extrabold tracking-tight text-on-surface flex items-center gap-2">
                <Car className="h-5 w-5 text-on-surface-variant" />
                Vehicles
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {vehicles.map((vehicle) => {
                const v = vehicle as typeof vehicle & { vehicle_media?: { url: string; is_primary: boolean }[] };
                const media = v.vehicle_media?.find((m) => m.is_primary) ?? v.vehicle_media?.[0];
                const name = [v.year, v.make, v.model].filter(Boolean).join(" ");
                return (
                  <Link
                    key={v.id}
                    href={`/vehicle/${v.id}`}
                    className="group flex gap-4 items-center bg-surface-container-lowest rounded-[1.25rem] p-4 ghost-border shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="w-20 h-16 rounded-xl overflow-hidden bg-surface-container flex-shrink-0">
                      {media ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={media.url} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Car className="h-6 w-6 text-on-surface-variant/30" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-bold text-sm text-on-surface truncate">{name || "Vehicle"}</p>
                      {v.trim && <p className="text-xs text-on-surface-variant">{v.trim}</p>}
                      {v.mileage != null && (
                        <div className="flex items-center gap-1 mt-1 text-[11px] text-on-surface-variant font-semibold">
                          <Gauge className="h-3 w-3" />
                          {formatMileage(v.mileage)} mi
                        </div>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-on-surface-variant group-hover:translate-x-1 transition-transform flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Marketplace listings ─────────────────────────────────── */}
        {listings.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-lg font-extrabold tracking-tight text-on-surface flex items-center gap-2">
                <Tag className="h-5 w-5 text-on-surface-variant" />
                Listings for Sale
              </h2>
              <Link href="/marketplace" className="text-xs font-bold text-on-tertiary-container hover:underline flex items-center gap-1">
                Browse all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {listings.map((listing) => {
                const l = listing as typeof listing & {
                  vehicle?: { id: string; year?: number | null; make?: string | null; model?: string | null; trim?: string | null; mileage?: number | null; vehicle_media?: { url: string; is_primary: boolean }[] } | null;
                };
                const v = l.vehicle;
                const media = v?.vehicle_media?.find((m) => m.is_primary) ?? v?.vehicle_media?.[0];
                const name = [v?.year, v?.make, v?.model].filter(Boolean).join(" ");
                return (
                  <Link
                    key={l.id}
                    href={`/vehicle/${l.vehicle_id}?tab=marketplace`}
                    className="group bg-surface-container-lowest rounded-[1.25rem] overflow-hidden ghost-border shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="h-44 bg-surface-container-low overflow-hidden relative">
                      {media ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={media.url} alt={name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Car className="h-10 w-10 text-on-surface-variant/20" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-primary-container/60 via-transparent to-transparent" />
                      <Badge className="absolute bottom-3 right-3 bg-white/90 text-primary hover:bg-white/90">
                        {formatCurrency(l.asking_price_cents)}
                      </Badge>
                    </div>
                    <div className="p-4">
                      <p className="font-heading font-bold text-sm text-on-surface mb-1">{name || l.title || "Vehicle"}</p>
                      <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-on-surface-variant">
                        {v?.mileage != null && (
                          <span className="flex items-center gap-1"><Gauge className="h-3 w-3" />{formatMileage(v.mileage)} mi</span>
                        )}
                        {l.location && (
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{l.location}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Completed inspections ────────────────────────────────── */}
        {ppis.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-lg font-extrabold tracking-tight text-on-surface flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-on-surface-variant" />
                Inspections
              </h2>
            </div>
            <div className="space-y-3">
              {ppis.map((ppi) => {
                const p = ppi as typeof ppi & {
                  vehicle?: { id: string; year?: number | null; make?: string | null; model?: string | null; trim?: string | null; visibility?: string; vehicle_media?: { url: string; is_primary: boolean }[] } | null;
                };
                const badge = PPI_BADGE[p.ppi_type as keyof typeof PPI_BADGE];
                const v = p.vehicle;
                const name = [v?.year, v?.make, v?.model].filter(Boolean).join(" ");
                return (
                  <Link
                    key={p.id}
                    href={`/vehicle/${v?.id}?tab=ppi-history`}
                    className="group flex items-center gap-4 bg-surface-container-lowest rounded-[1.25rem] p-4 ghost-border shadow-sm hover:shadow-md transition-all"
                  >
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold flex-shrink-0 ${badge?.color} ${badge?.bg}`}>
                      <Award className="h-3.5 w-3.5" />
                      {badge?.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-bold text-sm text-on-surface truncate">{name || "Vehicle"}</p>
                      <p className="text-xs text-on-surface-variant">{formatDate(p.created_at)}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-on-surface-variant group-hover:translate-x-1 transition-transform flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Community posts ──────────────────────────────────────── */}
        {posts.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-lg font-extrabold tracking-tight text-on-surface flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-on-surface-variant" />
                Posts
              </h2>
              <Link href="/community" className="text-xs font-bold text-on-tertiary-container hover:underline flex items-center gap-1">
                Community feed <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="space-y-3">
              {posts.map((post) => {
                const pt = post as typeof post & {
                  vehicle?: { id: string; year?: number | null; make?: string | null; model?: string | null } | null;
                };
                return (
                  <div key={pt.id} className="bg-surface-container-lowest rounded-[1.25rem] p-5 ghost-border shadow-sm">
                    <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-3 mb-3">
                      {pt.content}
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-on-surface-variant">{formatDate(pt.created_at)}</p>
                      {pt.vehicle && (
                        <Link
                          href={`/vehicle/${pt.vehicle.id}`}
                          className="text-xs font-bold text-on-tertiary-container hover:underline flex items-center gap-1"
                        >
                          <Car className="h-3 w-3" />
                          {[pt.vehicle.year, pt.vehicle.make, pt.vehicle.model].filter(Boolean).join(" ")}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Empty state ──────────────────────────────────────────── */}
        {vehicles.length === 0 && listings.length === 0 && ppis.length === 0 && posts.length === 0 && (
          <div className="text-center py-16">
            <Car className="h-12 w-12 mx-auto mb-4 text-on-surface-variant/30" />
            <p className="font-heading font-bold text-on-surface mb-1">Nothing public yet</p>
            <p className="text-sm text-on-surface-variant">
              This user hasn&apos;t made any vehicles or content public yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
