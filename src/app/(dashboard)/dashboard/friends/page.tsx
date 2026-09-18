import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { friendsDiscoveryEnabled, getMyFriendRequests, getMyFriends, type PersonSummary } from "@/features/social/friends";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FriendActionButton } from "@/components/shared/friend-action-button";
import { formatDate, getInitials } from "@/lib/utils/formatting";
import { Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ContactDiscoveryPanel } from "@/components/shared/contact-discovery-panel";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

// Plan 10.4: the owner manages requests and their friend list here. Other
// members never see this list; they only see mutual friends on a profile.
export default async function DashboardFriendsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const uiText = await getRequestTranslator();
  await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const friendQuery = ((await searchParams).q ?? "").trim().toLocaleLowerCase();
  const [friends, requests, enabled] = await Promise.all([
    getMyFriends(),
    getMyFriendRequests(),
    friendsDiscoveryEnabled(),
  ]);
  const visibleFriends = friendQuery
    ? friends.filter((friend) => friend.username?.toLocaleLowerCase().includes(friendQuery) || friend.display_name?.toLocaleLowerCase().includes(friendQuery))
    : friends;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight">{uiText("ui.friends_bd104d1b98")}</h1>
          <p className="text-sm text-muted-foreground">{uiText("ui.friends_can_see_your_friends_only_posts_decl_eaa388a3db")}</p>
        </div>
        {enabled ? (
          <Button asChild>
            <Link href="/community/people">
              <Search className="mr-2 h-4 w-4" />{uiText("ui.find_people_17a85d8fc0")}</Link>
          </Button>
        ) : null}
      </div>

      {!enabled ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">{uiText("ui.friend_requests_are_switched_off_in_this_rel_ed38b2f81f")}</CardContent>
        </Card>
      ) : null}

      {enabled ? (
        <>
          <form action="/dashboard/friends" role="search" className="flex gap-2">
            <Input name="q" defaultValue={friendQuery} placeholder={uiText("ui.search_your_friends_4ae6073e58")} aria-label={uiText("ui.search_your_friends_4ae6073e58")} />
            <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />{uiText("ui.search_49c266baaa")}</Button>
          </form>
          <form action="/community/people" role="search" className="flex gap-2">
            <Input name="q" placeholder={uiText("ui.search_any_perfectppi_member_430b5a1cc5")} aria-label={uiText("ui.search_all_perfectppi_members_7bea6f5c21")} />
            <Button type="submit">{uiText("ui.find_account_88fda329a7")}</Button>
          </form>
          <ContactDiscoveryPanel />
        </>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.requests_for_you_454fb85285")}{requests.incoming.length > 0 ? uiText("ui.text_08d7002db4", { arg0: String(requests.incoming.length) }) : ""}
        </h2>
        {requests.incoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{uiText("ui.no_pending_requests_4c963f0813")}</p>
        ) : (
          requests.incoming.map((person) => (
            <PersonRow key={person.id} person={person} meta={`Sent ${formatDate(person.created_at)}`}>
              <FriendActionButton profileId={person.id} state="incoming_request" enabled={enabled} compact />
            </PersonRow>
          ))
        )}
      </section>

      {requests.outgoing.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.sent_by_you_3c79df22ca")}</h2>
          {requests.outgoing.map((person) => (
            <PersonRow key={person.id} person={person} meta={`Sent ${formatDate(person.created_at)}`}>
              <FriendActionButton profileId={person.id} state="outgoing_request" enabled={enabled} compact />
            </PersonRow>
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{uiText("ui.friends_a2b32418dc")}{friends.length > 0 ? uiText("ui.text_08d7002db4", { arg0: String(friends.length) }) : ""}
        </h2>
        {friends.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{uiText("ui.no_friends_yet_search_for_people_you_know_an_e321ec0f83")}</p>
            </CardContent>
          </Card>
        ) : (
          visibleFriends.length === 0 && friendQuery ? <p className="text-sm text-muted-foreground">{uiText("ui.no_friends_match_your_search_291648d09d")}</p> : visibleFriends.map((person) => (
            <PersonRow key={person.id} person={person} meta={`Friends since ${formatDate(person.friends_since)}`}>
              <FriendActionButton profileId={person.id} state="friends" enabled={enabled} compact />
            </PersonRow>
          ))
        )}
      </section>
    </div>
  );
}

function PersonRow({ person, meta, children }: { person: PersonSummary; meta: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <Link href={person.username ? `/profile/${person.username}` : "#"} className="flex min-w-0 items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={person.avatar_url ?? ""} />
            <AvatarFallback className="text-xs">{getInitials(person.display_name ?? person.username ?? uiText("ui.u_a25513c7e0"))}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{person.display_name ?? person.username ?? uiText("ui.perfectppi_member_99bd607db6")}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {person.username ? uiText("ui.text_218d2e50d8", { arg0: String(person.username) }) : ""}{meta}
            </span>
          </span>
        </Link>
        {children}
      </CardContent>
    </Card>
  );
}
