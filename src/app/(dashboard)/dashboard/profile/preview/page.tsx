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

import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

// Plan 9.3 "View as Stranger": exactly what a signed-in member with no
// relationship receives for this profile, produced by the same DTO the
// member profile API serves, reduced by the stranger rules.
export default async function ProfilePreviewPage() {
  const uiText = await getRequestTranslator();
  const me = await requireRole(["consumer", "technician", "org_manager", "admin"]);
  if (!me.username) redirect("/dashboard/profile");
  const preview = await getMemberProfile(me.username, { asStranger: true });
  if (!preview) redirect("/dashboard/profile");

  const { profile, vehicles, listings, posts } = preview;
  const name = profile.display_name ?? profile.username ?? uiText("ui.perfectppi_member_99bd607db6");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="flex items-center gap-2 font-semibold"><Eye className="h-4 w-4" />{uiText("ui.previewing_as_a_stranger_fc6fb5ba9d")}</p>
        <p className="mt-1 text-xs">{uiText("ui.this_is_what_a_signed_in_member_who_is_not_y_fd14b797ac")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link href="/dashboard/profile">{uiText("ui.back_to_edit_profile_a9bcfaff20")}</Link></Button>
          {profile.username ? <Button asChild size="sm" variant="ghost"><Link href={`/profile/${profile.username}`}>{uiText("ui.open_my_profile_60bf9e2dd1")}</Link></Button> : null}
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
              {!profile.is_public ? <Badge variant="outline"><Lock className="mr-1 h-3 w-3" />{uiText("ui.private_profile_5a024309a3")}</Badge> : null}
              {profile.badges.map((badge) => (
                <Badge key={badge.code} variant="secondary" title={badge.description}>{badge.label}</Badge>
              ))}
            </div>
            {profile.username ? <p className="text-sm text-muted-foreground">@{profile.username}</p> : null}
            {profile.bio ? (
              <p className="mt-2 text-sm">{profile.bio}</p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {profile.is_public ? uiText("ui.no_bio_yet_dce2236753") : uiText("ui.your_bio_is_shown_to_friends_only_bc65d53f9b")}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">{uiText("ui.member_since_5c4a4c9b9c")}{formatDate(profile.created_at)}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled>{uiText("ui.add_friend_c1f8728197")}</Button>
              <Button size="sm" variant="outline" disabled>{uiText("ui.message_2f77668a9d")}</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground"><Car className="h-4 w-4" />{uiText("ui.garage_62e8d5cad2")}</h2>
        {vehicles.length === 0 ? (
          <Card><CardContent className="p-5 text-sm text-muted-foreground">
            {profile.is_public ? uiText("ui.no_public_vehicles_vehicles_set_to_public_ap_d48f5c6209") : uiText("ui.strangers_see_no_vehicles_on_a_private_profi_148cd40c64")}
          </CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {vehicles.map((vehicle) => (
              <Card key={vehicle.id}><CardContent className="p-4">
                <p className="font-semibold">{[vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ") || uiText("ui.vehicle_a62394ba4a")}</p>
                {vehicle.mileage != null ? <p className="text-xs text-muted-foreground">{formatMileage(vehicle.mileage)}{uiText("ui.mi_3074dbe604")}</p> : null}
              </CardContent></Card>
            ))}
          </div>
        )}
        {listings.length > 0 ? (
          <p className="text-xs text-muted-foreground">{listings.length}{uiText("ui.active_listing_b40a4597ae")}{listings.length === 1 ? "" : uiText("ui.s_043a718774")}{uiText("ui.also_visible_f3c9c38b17")}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground"><MessageSquare className="h-4 w-4" />{uiText("ui.posts_fc83898938")}</h2>
        {posts.length === 0 ? (
          <Card><CardContent className="p-5 text-sm text-muted-foreground">
            {profile.is_public ? uiText("ui.no_public_posts_posts_marked_friends_are_hid_0d4471b11e") : uiText("ui.strangers_see_no_posts_on_a_private_profile_15504ce0fa")}
          </CardContent></Card>
        ) : (
          posts.map((post) => (
            <Card key={post.id}><CardContent className="space-y-2 p-5">
              <p className="whitespace-pre-wrap text-sm">{post.content}</p>
              <p className="text-xs text-muted-foreground">{formatDate(post.created_at)}{uiText("ui.public_3469de3f43")}</p>
            </CardContent></Card>
          ))
        )}
      </section>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />{uiText("ui.mutual_friends_and_friend_only_content_are_n_3d879de956")}</p>
    </div>
  );
}
