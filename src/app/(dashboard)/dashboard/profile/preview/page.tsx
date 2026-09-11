import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/features/auth/guards";
import { getMemberProfile } from "@/features/profiles/member-profile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMileage, getInitials } from "@/lib/utils/formatting";
import { Car, Eye, Lock, MessageSquare, Users } from "lucide-react";

export const dynamic = "force-dynamic";

// Plan 9.3 "View as Stranger": exactly what a signed-in member with no
// relationship receives for this profile, produced by the same DTO the
// member profile API serves, reduced by the stranger rules.
export default async function ProfilePreviewPage() {
  const me = await requireRole(["consumer", "technician", "org_manager", "admin"]);
  if (!me.username) redirect("/dashboard/profile");
  const preview = await getMemberProfile(me.username, { asStranger: true });
  if (!preview) redirect("/dashboard/profile");

  const { profile, vehicles, listings, posts } = preview;
  const name = profile.display_name ?? profile.username ?? "PerfectPPI member";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="flex items-center gap-2 font-semibold"><Eye className="h-4 w-4" /> Previewing as a stranger</p>
        <p className="mt-1 text-xs">
          This is what a signed-in member who is not your friend sees. Friends see anything you mark Friends; nobody outside PerfectPPI sees your profile.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link href="/dashboard/profile">Back to Edit Profile</Link></Button>
          {profile.username ? <Button asChild size="sm" variant="ghost"><Link href={`/profile/${profile.username}`}>Open my profile</Link></Button> : null}
        </div>
      </div>

      <Card>
        <CardContent className="flex items-start gap-4 p-6">
          <Avatar className="h-16 w-16">
            <AvatarImage src={profile.avatar_url ?? ""} />
            <AvatarFallback className="text-lg font-bold">{getInitials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-xl font-extrabold">{name}</h1>
              {!profile.is_public ? <Badge variant="outline"><Lock className="mr-1 h-3 w-3" />Private profile</Badge> : null}
              {profile.badges.map((badge) => (
                <Badge key={badge.code} variant="secondary" title={badge.description}>{badge.label}</Badge>
              ))}
            </div>
            {profile.username ? <p className="text-sm text-muted-foreground">@{profile.username}</p> : null}
            {profile.bio ? (
              <p className="mt-2 text-sm">{profile.bio}</p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {profile.is_public ? "No bio yet." : "Your bio is shown to friends only."}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Member since {formatDate(profile.created_at)}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled>Add friend</Button>
              <Button size="sm" variant="outline" disabled>Message</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground"><Car className="h-4 w-4" /> Garage</h2>
        {vehicles.length === 0 ? (
          <Card><CardContent className="p-5 text-sm text-muted-foreground">
            {profile.is_public ? "No public vehicles. Vehicles set to Public appear here." : "Strangers see no vehicles on a private profile."}
          </CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {vehicles.map((vehicle) => (
              <Card key={vehicle.id}><CardContent className="p-4">
                <p className="font-semibold">{[vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ") || "Vehicle"}</p>
                {vehicle.mileage != null ? <p className="text-xs text-muted-foreground">{formatMileage(vehicle.mileage)} mi</p> : null}
              </CardContent></Card>
            ))}
          </div>
        )}
        {listings.length > 0 ? (
          <p className="text-xs text-muted-foreground">{listings.length} active listing{listings.length === 1 ? "" : "s"} also visible.</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground"><MessageSquare className="h-4 w-4" /> Posts</h2>
        {posts.length === 0 ? (
          <Card><CardContent className="p-5 text-sm text-muted-foreground">
            {profile.is_public ? "No Public posts. Posts marked Friends are hidden from strangers." : "Strangers see no posts on a private profile."}
          </CardContent></Card>
        ) : (
          posts.map((post) => (
            <Card key={post.id}><CardContent className="space-y-2 p-5">
              <p className="whitespace-pre-wrap text-sm">{post.content}</p>
              <p className="text-xs text-muted-foreground">{formatDate(post.created_at)} · Public</p>
            </CardContent></Card>
          ))
        )}
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> Mutual friends and friend-only content are never shown to strangers.
      </p>
    </div>
  );
}
