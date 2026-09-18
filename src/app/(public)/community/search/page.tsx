import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import {
  isSearchTab,
  normalizeSearchQuery,
  SEARCH_MIN_LENGTH,
  SEARCH_TAB_LABELS,
  SEARCH_TABS,
  unifiedSearch,
  type SearchTab,
} from "@/features/search/queries";
import { SearchBox } from "@/components/shared/search-box";
import { CommunityPostArticle } from "@/components/shared/community-post-article";
import { FriendActionButton } from "@/components/shared/friend-action-button";
import { GroupMembershipButton } from "@/components/shared/group-membership-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, getInitials } from "@/lib/utils/formatting";
import { sharePath } from "@/lib/share/links";
import { ArrowLeft, CalendarDays, Car, Lock, MapPin, Search, Tag, Wrench } from "lucide-react";
import { getFeatureFlags } from "@/lib/feature-flags";
import { decodeSearchCursor, usesSearchCursor } from "@/features/search/cursor";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const metadata = { title: uiText("ui.search_perfectppi_community_f820d0141b") };
export const dynamic = "force-dynamic";

function href(query: string, tab: SearchTab, page = 1, cursor?: string | null) {
  const params = new URLSearchParams({ q: query, tab });
  if (cursor) params.set("cursor", cursor);
  else if (page > 1) params.set("page", String(page));
  return `/community/search?${params}`;
}

// Unified search (plan 27.2): one query, one tab per result type. The
// database applies discoverability, membership, blocks, and moderation state
// before anything reaches this page.
export default async function CommunitySearchPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; page?: string; cursor?: string }> }) {
  const uiText = await getRequestTranslator();
  const viewer = await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const params = await searchParams;
  const query = normalizeSearchQuery(params.q);
  const flags = await getFeatureFlags();
  const requestedTab: SearchTab = isSearchTab(params.tab) ? params.tab : "posts";
  const tab: SearchTab = requestedTab === "events" && !flags.flags.events ? "posts" : requestedTab;
  const visibleTabs = SEARCH_TABS.filter((entry) => entry !== "events" || flags.flags.events);
  const requestedPage = Number(params.page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const cursorMode = usesSearchCursor(tab);
  const cursor = cursorMode && params.cursor ? decodeSearchCursor(params.cursor, tab, query) : null;
  const results = query.length >= SEARCH_MIN_LENGTH
    ? await unifiedSearch(query, tab, page, cursorMode ? cursor : undefined)
    : null;

  return (
    <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3"><Link href="/community"><ArrowLeft className="mr-2 h-4 w-4" />{uiText("ui.community_bb501d7877")}</Link></Button>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">{uiText("ui.search_49c266baaa")}</h1>
        <p className="mt-2 text-sm text-on-surface-variant">{uiText("ui.makes_models_years_and_diagnostic_codes_are__1db5523581")}</p>
        <div className="mt-6"><SearchBox initialQuery={query} tab={tab} autoFocus={!query} /></div>

        <nav className="mt-6 flex flex-wrap gap-1 rounded-2xl bg-surface-container-low p-1.5 ghost-border" aria-label={uiText("ui.result_types_0c94f1779c")}>
          {visibleTabs.map((entry) => (
            <Link
              key={entry}
              href={query ? href(query, entry) : `/community/search?tab=${entry}`}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === entry ? "bg-surface-container-lowest shadow-sm" : "text-on-surface-variant"}`}
              aria-current={tab === entry ? "page" : undefined}
            >
              {SEARCH_TAB_LABELS[entry]}
            </Link>
          ))}
        </nav>

        <section className="mt-5 space-y-4" aria-live="polite">
          {!results ? (
            <Empty title={query ? uiText("ui.keep_typing_e480e20837") : uiText("ui.what_are_you_looking_for_e3ad92be49")} body={query ? `Enter at least ${SEARCH_MIN_LENGTH} characters.` : "Search across posts, people, groups, cars, listings, and technicians."} />
          ) : results.items.length === 0 ? (
            <Empty
              title={uiText("ui.no_match_0f2d7b5edc", { arg0: String(SEARCH_TAB_LABELS[tab].toLowerCase()), arg1: String(query) })}
              body={results.suggestions.length ? `Did you mean ${results.suggestions.join(", ")}? Try another result type or fewer words.` : "Check the spelling, try fewer words, or another result type. Private content never appears in search."}
            />
          ) : results.tab === "posts" ? (
            results.items.map((post) => <CommunityPostArticle key={post.id} post={post} viewerId={viewer.id} />)
          ) : results.tab === "people" ? (
            results.items.map((person) => (
              <article key={person.id} className="flex items-center justify-between gap-4 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ghost-border">
                <Link href={person.username ? `/profile/${person.username}` : "#"} className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-11 w-11"><AvatarImage src={person.avatar_url ?? ""} /><AvatarFallback className="text-xs">{getInitials(person.display_name ?? person.username ?? uiText("ui.u_a25513c7e0"))}</AvatarFallback></Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{person.display_name ?? person.username ?? uiText("ui.perfectppi_member_99bd607db6")}</span>
                    <span className="block truncate text-xs text-on-surface-variant">{person.username ? uiText("ui.text_d513a96df3", { arg0: String(person.username) }) : null}{person.mutual_friend_count > 0 ? uiText("ui.mutual_friend_8649b5f78a", { arg0: String(person.mutual_friend_count), arg1: String(person.mutual_friend_count === 1 ? "" : "s") }) : null}</span>
                  </span>
                </Link>
                <FriendActionButton profileId={person.id} state={person.relationship_state} compact />
              </article>
            ))
          ) : results.tab === "groups" ? (
            results.items.map((group) => (
              <article key={group.id} className="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ghost-border sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={sharePath({ kind: "group", slug: group.slug })} className="font-bold hover:text-primary">{group.name}</Link>
                    {group.visibility !== "public" ? <Badge variant="outline"><Lock className="mr-1 h-3 w-3" />{group.visibility === "private" ? uiText("ui.private_c63eb6720c") : uiText("ui.unlisted_bc96567e77")}</Badge> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{group.description}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">{group.member_count}{uiText("ui.member_262e180603")}{group.member_count === 1 ? "" : uiText("ui.s_043a718774")}{group.location_region ? uiText("ui.text_913ac5c53d", { arg0: String(group.location_region) }) : ""}</p>
                </div>
                <GroupMembershipButton groupId={group.id} status={group.membership_status} joinPolicy={group.join_policy} owner={group.membership_role === "owner"} />
              </article>
            ))
          ) : results.tab === "vehicles" ? (
            results.items.map((vehicle) => (
              <Link key={vehicle.id} href={sharePath({ kind: "vehicle", id: vehicle.id })} className="flex items-center gap-4 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ghost-border hover:bg-surface-container">
                <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-container">
                  {vehicle.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={vehicle.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : <Car className="h-6 w-6 text-on-surface-variant/40" />}
                </div>
                <div className="min-w-0">
                  <p className="font-bold">{[vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ")}</p>
                  <p className="text-xs text-on-surface-variant">
                    {vehicle.nickname ? uiText("ui.text_0384621e39", { arg0: String(vehicle.nickname) }) : ""}{vehicle.owner?.display_name ?? vehicle.owner?.username ?? uiText("ui.perfectppi_member_99bd607db6")}
                    {vehicle.visibility === "friends" ? uiText("ui.friends_only_709fb80799") : ""}{vehicle.listing_id ? uiText("ui.for_sale_45b4c045de") : ""}
                  </p>
                </div>
              </Link>
            ))
          ) : results.tab === "listings" ? (
            results.items.map((listing) => (
              <Link key={listing.id} href={`/marketplace/listings/${listing.id}`} className="flex items-center gap-4 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ghost-border hover:bg-surface-container">
                <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-container">
                  {listing.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={listing.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : <Tag className="h-6 w-6 text-on-surface-variant/40" />}
                </div>
                <div className="min-w-0">
                  <p className="font-bold">{listing.title}</p>
                  <p className="text-xs text-on-surface-variant">{listing.vehicle_label}{listing.location ? uiText("ui.text_913ac5c53d", { arg0: String(listing.location) }) : ""} · {formatCurrency(listing.asking_price_cents)}</p>
                </div>
              </Link>
            ))
          ) : results.tab === "technicians" ? (
            results.items.map((technician) => (
              <Link key={technician.id} href={`/technicians/${technician.id}`} className="flex items-center gap-4 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ghost-border hover:bg-surface-container">
                <Avatar className="h-11 w-11"><AvatarImage src={technician.avatar_url ?? ""} /><AvatarFallback className="text-xs">{getInitials(technician.display_name ?? technician.username ?? uiText("ui.t_e632b7095b"))}</AvatarFallback></Avatar>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-bold"><Wrench className="h-3.5 w-3.5 text-on-surface-variant" />{technician.display_name ?? technician.username ?? uiText("ui.technician_9041ccc417")}</p>
                  <p className="text-xs text-on-surface-variant">
                    {[technician.service_area, technician.specialties.slice(0, 3).join(", "), `${technician.total_inspections} inspections`].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </Link>
            ))
          ) : (
            results.items.map((event) => (
              <Link key={event.id} href={`/community/events/${event.id}`} className="flex items-start gap-4 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ghost-border hover:bg-surface-container">
                <CalendarDays className="mt-1 h-6 w-6 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="font-bold">{event.title}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">{new Intl.DateTimeFormat(uiText("ui.en_dbd3a49d0d"), { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.starts_at))}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-on-surface-variant"><MapPin className="h-3 w-3" />{event.general_location} · {event.going_count}{uiText("ui.going_7a3c51cf51")}</p>
                </div>
              </Link>
            ))
          )}
          {results && (cursorMode ? Boolean(params.cursor || results.nextCursor) : page > 1 || results.hasMore) ? (
            <nav className="flex items-center justify-between pt-3" aria-label={uiText("ui.search_pagination_c3634a64b7")}>
              {cursorMode ? (
                params.cursor ? <Button asChild variant="outline"><Link href={href(query, tab)}>{uiText("ui.back_to_first_results_58fbbfa217")}</Link></Button> : <span />
              ) : page > 1 ? <Button asChild variant="outline"><Link href={href(query, tab, page - 1)}>{uiText("ui.previous_a57b08a480")}</Link></Button> : <span />}
              {cursorMode ? (
                results.nextCursor ? <Button asChild variant="outline"><Link href={href(query, tab, 1, results.nextCursor)}>{uiText("ui.more_results_750ecbe1c8")}</Link></Button> : <span />
              ) : results.hasMore ? <Button asChild variant="outline"><Link href={href(query, tab, page + 1)}>{uiText("ui.next_1ff57a29d7")}</Link></Button> : <span />}
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl bg-surface-container-lowest p-10 text-center ghost-border">
      <Search className="mx-auto mb-3 h-9 w-9 text-on-surface-variant/40" />
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-on-surface-variant">{body}</p>
    </div>
  );
}
