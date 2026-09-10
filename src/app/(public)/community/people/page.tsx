import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { friendsDiscoveryEnabled, searchPeople } from "@/features/social/friends";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FriendActionButton } from "@/components/shared/friend-action-button";
import { getInitials } from "@/lib/utils/formatting";
import { Search, UserPlus, Users } from "lucide-react";

export const metadata = {
  title: "Find People — PerfectPPI",
  description: "Search PerfectPPI members by username or display name.",
};

export const dynamic = "force-dynamic";

// Plan 12: search by exact or partial username / display name, exact
// username first; the database applies discoverability, blocks, and account
// state before anything is returned.
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const requestedPage = Number(params.page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const enabled = await friendsDiscoveryEnabled();
  const search = enabled && query
    ? await searchPeople(query, page)
    : { results: [], hasMore: false, outcome: "ok" as const, retryAfter: null };
  const { results, hasMore, outcome } = search;
  const tooShort = query.replace(/^@/, "").length > 0 && query.replace(/^@/, "").length < 2;

  return (
    <div className="min-h-screen bg-surface">
      <section className="px-8 pb-10 pt-28">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-on-surface">Find people</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Search by username or name. Members who turned off discovery only appear when you enter their complete username.
          </p>
          <form action="/community/people" method="get" className="mt-6 flex gap-2" role="search">
            <Input
              name="q"
              defaultValue={query}
              placeholder="@username or name"
              maxLength={64}
              autoComplete="off"
              aria-label="Search people"
              disabled={!enabled}
            />
            <Button type="submit" disabled={!enabled}>
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
          </form>
          <div className="mt-3 flex items-center gap-4 text-xs">
            <Link href="/dashboard/friends" className="font-bold text-on-tertiary-container hover:underline">Your friends and requests</Link>
            <Link href="/community" className="font-bold text-on-tertiary-container hover:underline">Back to Community</Link>
          </div>
        </div>
      </section>

      <section className="px-8 pb-20">
        <div className="mx-auto max-w-3xl space-y-3">
          {!enabled ? (
            <EmptyState icon={Users} title="People search is not available yet" body="Friend requests and people search are switched off in this release." />
          ) : outcome === "rate_limited" ? (
            <EmptyState icon={Search} title="Please slow down" body="You have searched frequently. Wait a moment and try again." />
          ) : outcome === "unavailable" ? (
            <EmptyState icon={Search} title="Search is temporarily unavailable" body="We could not safely run this search. Please try again shortly." />
          ) : tooShort ? (
            <EmptyState icon={Search} title="Keep typing" body="Enter at least two characters." />
          ) : query && results.length === 0 ? (
            <EmptyState icon={Search} title="No members found" body="Check the spelling, or ask for their complete username." />
          ) : !query ? (
            <EmptyState icon={UserPlus} title="Search for someone you know" body="Results show a member's name, username, and mutual friends." />
          ) : (
            results.map((person) => (
              <article key={person.id} className="flex items-center justify-between gap-4 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ghost-border">
                <Link href={person.username ? `/profile/${person.username}` : "#"} className="flex min-w-0 items-center gap-3">
                  <Avatar className="h-11 w-11">
                    <AvatarImage src={person.avatar_url ?? ""} />
                    <AvatarFallback className="text-xs">{getInitials(person.display_name ?? person.username ?? "U")}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-on-surface">
                      {person.display_name ?? person.username ?? "PerfectPPI member"}
                    </span>
                    <span className="block truncate text-xs text-on-surface-variant">
                      {person.username ? `@${person.username}` : null}
                      {person.mutual_friend_count > 0
                        ? ` · ${person.mutual_friend_count} mutual friend${person.mutual_friend_count === 1 ? "" : "s"}`
                        : null}
                      {person.exact_match ? " · exact match" : null}
                    </span>
                  </span>
                </Link>
                <FriendActionButton profileId={person.id} state={person.relationship_state} compact />
              </article>
            ))
          )}
          {query && enabled ? (
            <nav className="flex items-center justify-between pt-3" aria-label="Search pagination">
              {page > 1 ? (
                <Button asChild variant="outline"><Link href={`/community/people?q=${encodeURIComponent(query)}&page=${page - 1}`}>Previous</Link></Button>
              ) : <span />}
              {hasMore ? (
                <Button asChild variant="outline"><Link href={`/community/people?q=${encodeURIComponent(query)}&page=${page + 1}`}>Next</Link></Button>
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
