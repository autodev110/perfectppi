import Link from "next/link";
import { createCuratedCommunityGroup, reviewCommunityGroup } from "@/features/social/group-actions";
import { getAdminCommunityGroups } from "@/features/social/groups";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { getRequestTranslator } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminCommunityGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; reviewed?: string }>;
}) {
  const uiText = await getRequestTranslator();
  const [groups, params] = await Promise.all([getAdminCommunityGroups(), searchParams]);
  const needsReview = groups.filter((group) => group.review_reason);
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" className="mb-2 -ml-3"><Link href="/admin/community"><ArrowLeft className="mr-2 h-4 w-4" />{uiText("ui.community_bb501d7877")}</Link></Button>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.curated_community_groups_07539d8fc6")}</h1>
        <p className="text-muted-foreground">{uiText("ui.create_the_public_open_groups_available_duri_0023b071d1")}</p>
      </div>
      {params.error ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{params.error}</p> : null}
      {params.created ? <p className="rounded-xl border border-teal/30 bg-teal/5 p-3 text-sm text-teal">{uiText("ui.group_created_8714f568dc")}</p> : null}
      {params.reviewed ? <p className="rounded-xl border border-teal/30 bg-teal/5 p-3 text-sm text-teal">{uiText("ui.review_action_recorded_in_the_group_s_modera_a5148dbb3a")}</p> : null}
      {needsReview.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>{uiText("ui.needs_platform_review_67dc03fcd0")}{needsReview.length})</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{uiText("ui.these_groups_have_no_available_owner_so_new__1ff62786aa")}<code>{uiText("ui.content_decide_d56bb86a74")}</code>{uiText("ui.capability_and_are_audited_5d5b227a0e")}</p>
            {needsReview.map((group) => (
              <div key={group.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{group.name}</p><Badge variant="destructive">{group.review_reason === "missing_owner" ? uiText("ui.no_owner_4339bb4393") : uiText("ui.owner_unavailable_28421c6933")}</Badge><span className="text-xs text-muted-foreground">/{group.slug} · {group.active_member_count}{uiText("ui.active_members_754eb4c0ce")}</span></div>
                <form action={reviewCommunityGroup} className="mt-3 grid gap-3 md:grid-cols-[1fr_2fr_auto_auto] md:items-end">
                  <input type="hidden" name="group_id" value={group.id} />
                  <div className="space-y-1"><Label htmlFor={`owner-${group.id}`}>{uiText("ui.new_owner_username_16fa4dd247")}</Label><Input id={`owner-${group.id}`} name="username" maxLength={64} placeholder={uiText("ui.member_79de64f755")} /></div>
                  <div className="space-y-1"><Label htmlFor={`reason-${group.id}`}>{uiText("ui.reason_logged_6661b6fcd9")}</Label><Input id={`reason-${group.id}`} name="reason" required minLength={10} maxLength={500} placeholder={uiText("ui.owner_suspended_member_volunteered_in_the_gr_96afec915f")} /></div>
                  <Button type="submit" name="decision" value="assign_owner" size="sm">{uiText("ui.assign_owner_b2926590d7")}</Button>
                  <Button type="submit" name="decision" value="archive" size="sm" variant="outline">{uiText("ui.archive_66f4804ee2")}</Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>{uiText("ui.create_group_35be9c541d")}</CardTitle></CardHeader>
        <CardContent>
          <form action={createCuratedCommunityGroup} className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="name">{uiText("ui.name_dcd1d5223f")}</Label><Input id="name" name="name" required maxLength={80} /></div>
            <div className="space-y-2"><Label htmlFor="slug">{uiText("ui.stable_slug_56aa9a1324")}</Label><Input id="slug" name="slug" required maxLength={64} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder={uiText("ui.maintenance_diagnostics_c829ef1387")} /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="description">{uiText("ui.description_526e0087cc")}</Label><Textarea id="description" name="description" required maxLength={500} /></div>
            <div className="space-y-2"><Label htmlFor="category">{uiText("ui.category_292c06f004")}</Label><select id="category" name="category" className="flex h-10 w-full rounded-md border bg-transparent px-3 text-sm"><option value="general">{uiText("ui.general_c910d474dc")}</option><option value="make_model">{uiText("ui.make_model_7def3d0dcf")}</option><option value="technical">{uiText("ui.technical_e851504f43")}</option><option value="detailing">{uiText("ui.detailing_c292c9e124")}</option><option value="off_road">{uiText("ui.off_road_997e67eb7e")}</option><option value="restoration">{uiText("ui.restoration_6a3c6c7789")}</option><option value="track">{uiText("ui.track_051f01f095")}</option><option value="classics">{uiText("ui.classics_731b1bb35c")}</option><option value="ev">{uiText("ui.ev_20e95ada67")}</option><option value="local_club">{uiText("ui.local_club_e03102f788")}</option></select></div>
            <div />
            <div className="space-y-2"><Label htmlFor="vehicle_make">{uiText("ui.suggested_vehicle_make_8806a6b899")}</Label><Input id="vehicle_make" name="vehicle_make" maxLength={64} placeholder={uiText("ui.acura_c39604016d")} /></div>
            <div className="space-y-2"><Label htmlFor="vehicle_model">{uiText("ui.suggested_vehicle_model_f051583b77")}</Label><Input id="vehicle_model" name="vehicle_model" maxLength={64} placeholder={uiText("ui.tlx_40cdb056eb")} /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="rules">{uiText("ui.rules_one_per_line_7edaaf7061")}</Label><Textarea id="rules" name="rules" rows={5} maxLength={2400} /></div>
            <div className="md:col-span-2"><Button type="submit">{uiText("ui.create_curated_group_90424ce278")}</Button></div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{uiText("ui.groups_7cc464ba9b")}{groups.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {groups.length === 0 ? <p className="text-sm text-muted-foreground">{uiText("ui.no_groups_have_been_created_7f9fcd91cf")}</p> : groups.map((group) => (
            <div key={group.id} className="flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
              <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{group.name}</p><Badge variant={group.status === "active" ? "default" : "secondary"}>{group.status}</Badge>{!group.has_active_owner ? <Badge variant="destructive">{uiText("ui.missing_owner_cdc5643dfb")}</Badge> : null}</div><p className="mt-1 text-xs text-muted-foreground">/{group.slug} · {group.active_member_count}{uiText("ui.active_members_754eb4c0ce")}</p></div>
              <Button asChild size="sm" variant="outline"><Link href={`/community/groups/${group.slug}`}><ExternalLink className="mr-2 h-3.5 w-3.5" />{uiText("ui.open_ed077f3d81")}</Link></Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
