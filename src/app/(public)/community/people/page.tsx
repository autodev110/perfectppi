import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { friendsDiscoveryEnabled, searchPeople } from "@/features/social/friends";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FriendActionButton } from "@/components/shared/friend-action-button";
import { getInitials } from "@/lib/utils/formatting";
import { Search, UserPlus, Users } from "lucide-react";
import { decodeSearchCursor } from "@/features/search/cursor";
import { normalizeSearchQuery } from "@/features/search/queries";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const metadata = {
  title: uiText("ui.find_people_perfectppi_e62019a1de"),
  description: uiText("ui.search_perfectppi_members_by_username_or_dis_98ffa00bce"),
};

export const dynamic = "force-dynamic";

// Plan 12: search by exact or partial username / display name, exact
// username first; the database applies discoverability, blocks, and account
// state before anything is returned.
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; cursor?: string }> }) {
  const uiText = await getRequestTranslator();
  await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const params = await searchParams;
  const query = normalizeSearchQuery(params.q);
  const requestedPage = Number(params.page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const enabled = await friendsDiscoveryEnabled();
  const cursor = params.cursor ? decodeSearchCursor(params.cursor, "people", query) : null;
  const search = enabled && query
    ? await searchPeople(query, page, cursor)
    : { results: [], hasMore: false, nextCursor: null, outcome: "ok" as const, retryAfter: null };
  const { results, nextCursor, outcome } = search;
  const tooShort = query.replace(/^@/, "").length > 0 && query.replace(/^@/, "").length < 2;

  return (
    <div className="min-h-screen bg-surface">
      <section className="px-8 pb-10 pt-28">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-on-surface">{uiText("ui.find_people_17a85d8fc0")}</h1>
          <p className="mt-2 text-sm text-on-surface-variant">{uiText("ui.search_by_username_or_name_members_who_turne_b69fc4f5db")}</p>
          <form action="/community/people" method="get" className="mt-6 flex gap-2" role="search">
            <Input
              name="q"
              defaultValue={query}
              placeholder={uiText("ui.username_or_name_2f2a4263a9")}
              maxLength={64}
              autoComplete="off"
              aria-label={uiText("ui.search_people_8a7e7f1bc5")}
              disabled={!enabled}
            />
            <Button type="submit" disabled={!enabled}>
              <Search className="mr-2 h-4 w-4" />{uiText("ui.search_49c266baaa")}</Button>
          </form>
          <div className="mt-3 flex items-center gap-4 text-xs">
            <Link href="/dashboard/friends" className="font-bold text-on-tertiary-container hover:underline">{uiText("ui.your_friends_and_requests_50c179b25f")}</Link>
            <Link href="/community" className="font-bold text-on-tertiary-container hover:underline">{uiText("ui.back_to_community_fc6e768cae")}</Link>
          </div>
        </div>
      </section>

      <section className="px-8 pb-20">
        <div className="mx-auto max-w-3xl space-y-3">
          {!enabled ? (
            <EmptyState icon={Users} title={uiText("ui.people_search_is_not_available_yet_c1a91fdf3e")} body="Friend requests and people search are switched off in this release." />
          ) : outcome === "rate_limited" ? (
            <EmptyState icon={Search} title={uiText("ui.please_slow_down_051395e683")} body="You have searched frequently. Wait a moment and try again." />
          ) : outcome === "unavailable" ? (
            <EmptyState icon={Search} title={uiText("ui.search_is_temporarily_unavailable_de495ae44d")} body="We could not safely run this search. Please try again shortly." />
          ) : tooShort ? (
            <EmptyState icon={Search} title={uiText("ui.keep_typing_e480e20837")} body="Enter at least two characters." />
          ) : query && results.length === 0 ? (
            <EmptyState icon={Search} title={uiText("ui.no_members_found_a4e937d257")} body="Check the spelling, or ask for their complete username." />
          ) : !query ? (
            <EmptyState icon={UserPlus} title={uiText("ui.search_for_someone_you_know_2519479505")} body="Results show a member's name, username, and mutual friends." />
          ) : (
            results.map((person) => (
              <article key={person.id} className="flex items-center justify-between gap-4 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ghost-border">
                <Link href={person.username ? `/profile/${person.username}` : "#"} className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-11 w-11">
                    <AvatarImage src={person.avatar_url ?? ""} />
                    <AvatarFallback className="text-xs">{getInitials(person.display_name ?? person.username ?? uiText("ui.u_a25513c7e0"))}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-on-surface">
                      {person.display_name ?? person.username ?? uiText("ui.perfectppi_member_99bd607db6")}
                    </span>
                    <span className="block truncate text-xs text-on-surface-variant">
                      {person.username ? uiText("ui.text_d513a96df3", { arg0: String(person.username) }) : null}
                      {person.mutual_friend_count > 0
                        ? uiText("ui.mutual_friend_8649b5f78a", { arg0: String(person.mutual_friend_count), arg1: String(person.mutual_friend_count === 1 ? "" : "s") })
                        : null}
                      {person.exact_match ? uiText("ui.exact_match_c8bb6b8fbf") : null}
                    </span>
                  </span>
                </Link>
                <FriendActionButton profileId={person.id} state={person.relationship_state} compact />
              </article>
            ))
          )}
          {query && enabled ? (
            <nav className="flex items-center justify-between pt-3" aria-label={uiText("ui.search_pagination_c3634a64b7")}>
              {params.cursor ? (
                <Button asChild variant="outline"><Link href={`/community/people?q=${encodeURIComponent(query)}`}>{uiText("ui.back_to_first_results_58fbbfa217")}</Link></Button>
              ) : <span />}
              {nextCursor ? (
                <Button asChild variant="outline"><Link href={`/community/people?q=${encodeURIComponent(query)}&cursor=${encodeURIComponent(nextCursor)}`}>{uiText("ui.more_results_750ecbe1c8")}</Link></Button>
              ) : <span />}
            </nav>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof Users; title: string; body: string }) {
  return (
    <div className="rounded-[1.75rem] bg-surface-container-lowest p-12 text-center shadow-sm ghost-border">
      <Icon className="mx-auto mb-4 h-10 w-10 text-on-surface-variant/30" />
      <h2 className="mb-1 font-heading text-lg font-extrabold tracking-tight text-on-surface">{title}</h2>
      <p className="mx-auto max-w-md text-sm text-on-surface-variant">{body}</p>
    </div>
  );
}
