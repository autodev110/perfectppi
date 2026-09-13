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

export const dynamic = "force-dynamic";

// Plan 10.4: the owner manages requests and their friend list here. Other
// members never see this list; they only see mutual friends on a profile.
export default async function DashboardFriendsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
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
          <h1 className="font-heading text-2xl font-extrabold tracking-tight">Friends</h1>
          <p className="text-sm text-muted-foreground">
            Friends can see your friends-only posts. Declining, cancelling, or removing never sends a notice.
          </p>
        </div>
        {enabled ? (
          <Button asChild>
            <Link href="/community/people">
              <Search className="mr-2 h-4 w-4" />
              Find people
            </Link>
          </Button>
        ) : null}
      </div>

      {!enabled ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Friend requests are switched off in this release. Existing friendships still apply to what you can see.
          </CardContent>
        </Card>
      ) : null}

      {enabled ? (
        <>
          <form action="/dashboard/friends" role="search" className="flex gap-2">
            <Input name="q" defaultValue={friendQuery} placeholder="Search your friends" aria-label="Search your friends" />
            <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />Search</Button>
          </form>
          <form action="/community/people" role="search" className="flex gap-2">
            <Input name="q" placeholder="Search any PerfectPPI member" aria-label="Search all PerfectPPI members" />
            <Button type="submit">Find account</Button>
          </form>
          <ContactDiscoveryPanel />
        </>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Requests for you {requests.incoming.length > 0 ? `(${requests.incoming.length})` : ""}
        </h2>
        {requests.incoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending requests.</p>
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
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Sent by you</h2>
          {requests.outgoing.map((person) => (
            <PersonRow key={person.id} person={person} meta={`Sent ${formatDate(person.created_at)}`}>
              <FriendActionButton profileId={person.id} state="outgoing_request" enabled={enabled} compact />
            </PersonRow>
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Friends {friends.length > 0 ? `(${friends.length})` : ""}
        </h2>
        {friends.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No friends yet. Search for people you know and send a request.</p>
            </CardContent>
          </Card>
        ) : (
          visibleFriends.length === 0 && friendQuery ? <p className="text-sm text-muted-foreground">No friends match your search.</p> : visibleFriends.map((person) => (
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
            <AvatarFallback className="text-xs">{getInitials(person.display_name ?? person.username ?? "U")}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{person.display_name ?? person.username ?? "PerfectPPI member"}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {person.username ? `@${person.username} · ` : ""}{meta}
            </span>
          </span>
        </Link>
        {children}
      </CardContent>
    </Card>
  );
}
