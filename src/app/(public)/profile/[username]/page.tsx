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
  ClipboardCheck,
  Tag,
  MessageSquare,
  ArrowRight,
  Shield,
  Users,
} from "lucide-react";
import { MemberSafetyActions } from "@/components/shared/member-safety-actions";
import { FriendActionButton } from "@/components/shared/friend-action-button";
import { getSocialRelationshipState } from "@/features/social/relationships";
import { friendsDiscoveryEnabled, getFriendRelationshipState } from "@/features/social/friends";
import { getOptionalProfile } from "@/features/auth/guards";
import { getProfileSharePreview, profileShareCard } from "@/features/share/previews";
import { ShareButton } from "@/components/shared/share-button";
import { sharePath } from "@/lib/share/links";
import { TechnicianCredentialFacts } from "@/components/shared/technician-credential-facts";
import { MemberContributionSummaryCard } from "@/components/shared/member-contribution-summary";
import { getMemberContributionSummary } from "@/features/profiles/reputation";
import { ExtendedReportControl } from "@/components/shared/extended-report-control";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

// ── Types ─────────────────────────────────────────────────────────────────────

type PageProps = { params: Promise<{ username: string }> };

// ── Metadata ──────────────────────────────────────────────────────────────────

// Share cards (plan 15.4) come from the anonymous-audience preview: public,
// lookup-enabled, available profiles only — never the viewer's own access.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const card = await profileShareCard(username);
  return {
    title: card.title,
    description: card.description,
    openGraph: { title: card.title, description: card.description, url: card.path, type: "profile" },
    robots: card.available ? undefined : { index: false },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PPI_BADGE = {
  personal:       { label: uiText("ui.owner_entered_5b48a5e342"), color: "text-amber-700",  bg: "bg-amber-50 border-amber-200" },
  general_tech:   { label: uiText("ui.technician_inspection_cd51204a54"), color: "text-slate-600",  bg: "bg-slate-50 border-slate-200" },
  certified_tech: { label: uiText("ui.reviewed_credential_3240dd1055"), color: "text-teal-700", bg: "bg-teal-50 border-teal-200" },
} as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PublicProfilePage({ params }: PageProps) {
  const uiText = await getRequestTranslator();
  const { username } = await params;
  const viewer = await getOptionalProfile(["consumer", "technician", "org_manager", "admin"]);
  if (!viewer) {
    // Signed-out share link: the public card and a sign-in prompt; private
    // and unknown profiles look identical.
    const preview = await getProfileSharePreview(username);
    const path = sharePath({ kind: "profile", username });
    return (
      <div className="min-h-screen bg-surface px-8 pb-20 pt-28">
        <div className="mx-auto max-w-2xl">
          {preview ? (
            <section className="flex flex-col items-start gap-5 rounded-[2rem] bg-surface-container-lowest p-8 shadow-sm ghost-border sm:flex-row">
              <Avatar className="h-20 w-20 flex-shrink-0 ring-4 ring-surface shadow-md">
                <AvatarImage src={preview.avatar_url ?? ""} />
                <AvatarFallback className="text-2xl font-bold">{getInitials(preview.display_name ?? preview.username)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-heading text-2xl font-extrabold tracking-tight text-on-surface">{preview.display_name ?? preview.username}</h1>
                  {preview.is_technician ? <Badge className="bg-secondary-container text-on-secondary-container">{uiText("ui.technician_9041ccc417")}</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-on-surface-variant">@{preview.username}</p>
                {preview.bio ? <p className="mt-3 max-w-xl text-sm leading-relaxed text-on-surface-variant">{preview.bio}</p> : null}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button asChild><Link href={`/login?redirect=${encodeURIComponent(path)}`}>{uiText("ui.sign_in_to_see_more_3a92d30221")}</Link></Button>
                  <Button asChild variant="outline"><Link href="/signup">{uiText("ui.join_perfectppi_b81135c87b")}</Link></Button>
                  <ShareButton path={path} title={uiText("ui.perfectppi_bcef5a6c45", { arg0: String(preview.display_name ?? preview.username) })} />
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border">
              <Users className="mx-auto mb-3 h-9 w-9 text-on-surface-variant/40" />
              <p className="font-semibold">{uiText("ui.this_profile_isn_t_available_09622a824c")}</p>
              <p className="mt-1 text-sm text-on-surface-variant">{uiText("ui.it_may_be_private_or_no_longer_exist_sign_in_101a71dd10")}</p>
              <Button asChild className="mt-5"><Link href={`/login?redirect=${encodeURIComponent(path)}`}>{uiText("ui.sign_in_bfd402b2f6")}</Link></Button>
            </section>
          )}
        </div>
      </div>
    );
  }
  const profile = await getPublicProfile(username);
  if (!profile) notFound();

  const [content, allTechEntries, relationship, friendship, friendsEnabled, contributions] = await Promise.all([
    getProfilePublicContent(profile.id),
    profile.role === "technician" ? getDirectory() : Promise.resolve([]),
    getSocialRelationshipState(profile.id),
    getFriendRelationshipState(profile.id),
    friendsDiscoveryEnabled(),
    getMemberContributionSummary(profile.id),
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
              {getInitials(profile.display_name ?? profile.username ?? uiText("ui.u_a25513c7e0"))}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="font-heading text-2xl font-extrabold tracking-tight text-on-surface">
                {profile.display_name ?? profile.username}
              </h1>
              {profile.role === "technician" && (
                <Badge className="bg-secondary-container text-on-secondary-container">{uiText("ui.technician_9041ccc417")}</Badge>
              )}
              {tech && (
                <TechnicianCredentialFacts credentials={tech.credentials} compact />
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
                  {vehicles.length}{uiText("ui.vehicle_87d1124383")}{vehicles.length !== 1 ? uiText("ui.s_043a718774") : ""}
                </div>
              )}
              {listings.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm font-bold text-on-surface">
                  <Tag className="h-4 w-4 text-on-surface-variant" />
                  {listings.length}{uiText("ui.listing_5712f39263")}{listings.length !== 1 ? uiText("ui.s_043a718774") : ""}
                </div>
              )}
              {ppis.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm font-bold text-on-surface">
                  <ClipboardCheck className="h-4 w-4 text-on-surface-variant" />
                  {ppis.length}{uiText("ui.inspection_6ddb257e8e")}{ppis.length !== 1 ? uiText("ui.s_043a718774") : ""}
                </div>
              )}
              {tech && (
                <div className="flex items-center gap-1.5 text-sm font-bold text-on-surface">
                  <Shield className="h-4 w-4 text-on-surface-variant" />
                  {tech.total_inspections}{uiText("ui.completed_4a6e27436d")}</div>
              )}
              {friendship && friendship.state !== "self" && friendship.mutualFriendCount > 0 && (
                <div className="flex items-center gap-1.5 text-sm font-bold text-on-surface">
                  <Users className="h-4 w-4 text-on-surface-variant" />
                  {friendship.mutualFriendCount}{uiText("ui.mutual_friend_2948e8c064")}{friendship.mutualFriendCount !== 1 ? uiText("ui.s_043a718774") : ""}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-shrink-0">
            {tech && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/technicians/${tech.id}`}>{uiText("ui.view_tech_profile_4ccfe1c834")}</Link>
              </Button>
            )}
            {friendship ? (
              <FriendActionButton profileId={profile.id} state={friendship.state} enabled={friendsEnabled} compact />
            ) : null}
            <Button asChild size="sm">
              <Link href={`/dashboard/messages`}>
                <MessageSquare className="mr-2 h-4 w-4" />{uiText("ui.message_2f77668a9d")}</Link>
            </Button>
            {relationship ? <MemberSafetyActions profileId={profile.id} muted={relationship.mutedByMe} /> : null}
            {profile.id !== viewer.id ? <ExtendedReportControl entityType="profile" entityId={profile.id} label={uiText("ui.profile_d696a35bdd")} /> : null}
            {profile.username ? <ShareButton path={sharePath({ kind: "profile", username: profile.username })} title={uiText("ui.perfectppi_bcef5a6c45", { arg0: String(profile.display_name ?? profile.username) })} compact className="self-center px-2" /> : null}
          </div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-8 py-10 space-y-14">

        <MemberContributionSummaryCard summary={contributions} />

        {/* ── Vehicles ────────────────────────────────────────────── */}
        {vehicles.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-heading text-lg font-extrabold tracking-tight text-on-surface flex items-center gap-2">
                <Car className="h-5 w-5 text-on-surface-variant" />{uiText("ui.vehicles_9113796a52")}</h2>
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
                      <p className="font-heading font-bold text-sm text-on-surface truncate">{name || uiText("ui.vehicle_a62394ba4a")}</p>
                      {v.trim && <p className="text-xs text-on-surface-variant">{v.trim}</p>}
                      {v.mileage != null && (
                        <div className="flex items-center gap-1 mt-1 text-[11px] text-on-surface-variant font-semibold">
                          <Gauge className="h-3 w-3" />
                          {formatMileage(v.mileage)}{uiText("ui.mi_3074dbe604")}</div>
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
                <Tag className="h-5 w-5 text-on-surface-variant" />{uiText("ui.listings_for_sale_5819911324")}</h2>
              <Link href="/marketplace" className="text-xs font-bold text-on-tertiary-container hover:underline flex items-center gap-1">{uiText("ui.browse_all_c04cc40ca0")}<ArrowRight className="h-3.5 w-3.5" />
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
                    href={`/marketplace/listings/${l.id}`}
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
                      <p className="font-heading font-bold text-sm text-on-surface mb-1">{name || l.title || uiText("ui.vehicle_a62394ba4a")}</p>
                      <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-on-surface-variant">
                        {v?.mileage != null && (
                          <span className="flex items-center gap-1"><Gauge className="h-3 w-3" />{formatMileage(v.mileage)}{uiText("ui.mi_3074dbe604")}</span>
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
                <ClipboardCheck className="h-5 w-5 text-on-surface-variant" />{uiText("ui.inspections_20cbe85cdd")}</h2>
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
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      {badge?.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-bold text-sm text-on-surface truncate">{name || uiText("ui.vehicle_a62394ba4a")}</p>
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
                <MessageSquare className="h-5 w-5 text-on-surface-variant" />{uiText("ui.posts_a80811cf68")}</h2>
              <Link href="/community" className="text-xs font-bold text-on-tertiary-container hover:underline flex items-center gap-1">{uiText("ui.community_feed_ee4c81cb9d")}<ArrowRight className="h-3.5 w-3.5" />
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
            <p className="font-heading font-bold text-on-surface mb-1">{uiText("ui.nothing_public_yet_a97b8d808e")}</p>
            <p className="text-sm text-on-surface-variant">{uiText("ui.this_user_hasn_t_made_any_vehicles_or_conten_1856aa6490")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
