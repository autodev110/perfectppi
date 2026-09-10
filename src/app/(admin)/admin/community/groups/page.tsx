import Link from "next/link";
import { createCuratedCommunityGroup } from "@/features/social/group-actions";
import { getAdminCommunityGroups } from "@/features/social/groups";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminCommunityGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const [groups, params] = await Promise.all([getAdminCommunityGroups(), searchParams]);
  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" className="mb-2 -ml-3"><Link href="/admin/community"><ArrowLeft className="mr-2 h-4 w-4" />Community</Link></Button>
        <h1 className="font-heading text-2xl font-bold">Curated Community Groups</h1>
        <p className="text-muted-foreground">Create the public, open groups available during the controlled social beta.</p>
      </div>
      {params.error ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{params.error}</p> : null}
      {params.created ? <p className="rounded-xl border border-teal/30 bg-teal/5 p-3 text-sm text-teal">Group created.</p> : null}
      <Card>
        <CardHeader><CardTitle>Create group</CardTitle></CardHeader>
        <CardContent>
          <form action={createCuratedCommunityGroup} className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="name">Name</Label><Input id="name" name="name" required maxLength={80} /></div>
            <div className="space-y-2"><Label htmlFor="slug">Stable slug</Label><Input id="slug" name="slug" required maxLength={64} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="maintenance-diagnostics" /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="description">Description</Label><Textarea id="description" name="description" required maxLength={500} /></div>
            <div className="space-y-2"><Label htmlFor="category">Category</Label><select id="category" name="category" className="flex h-10 w-full rounded-md border bg-transparent px-3 text-sm"><option value="general">General</option><option value="make_model">Make/model</option><option value="technical">Technical</option><option value="detailing">Detailing</option><option value="off_road">Off-road</option><option value="restoration">Restoration</option><option value="track">Track</option><option value="classics">Classics</option><option value="ev">EV</option><option value="local_club">Local club</option></select></div>
            <div />
            <div className="space-y-2"><Label htmlFor="vehicle_make">Suggested vehicle make</Label><Input id="vehicle_make" name="vehicle_make" maxLength={64} placeholder="Acura" /></div>
            <div className="space-y-2"><Label htmlFor="vehicle_model">Suggested vehicle model</Label><Input id="vehicle_model" name="vehicle_model" maxLength={64} placeholder="TLX" /></div>
            <div className="space-y-2 md:col-span-2"><Label htmlFor="rules">Rules, one per line</Label><Textarea id="rules" name="rules" rows={5} maxLength={2400} /></div>
            <div className="md:col-span-2"><Button type="submit">Create curated group</Button></div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Groups ({groups.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {groups.length === 0 ? <p className="text-sm text-muted-foreground">No groups have been created.</p> : groups.map((group) => (
            <div key={group.id} className="flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
              <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{group.name}</p><Badge variant={group.status === "active" ? "default" : "secondary"}>{group.status}</Badge>{!group.has_active_owner ? <Badge variant="destructive">Missing owner</Badge> : null}</div><p className="mt-1 text-xs text-muted-foreground">/{group.slug} · {group.active_member_count} active members</p></div>
              <Button asChild size="sm" variant="outline"><Link href={`/community/groups/${group.slug}`}><ExternalLink className="mr-2 h-3.5 w-3.5" />Open</Link></Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
