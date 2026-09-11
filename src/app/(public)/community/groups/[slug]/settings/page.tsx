import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/features/auth/guards";
import { getCommunityGroup } from "@/features/social/groups";
import { getViewerGroupRole } from "@/features/social/group-tools";
import { Button } from "@/components/ui/button";
import { GroupSettingsForm } from "@/components/shared/group-settings-form";
import { GroupImageManager } from "@/components/shared/group-image-manager";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// Owner/admin group settings (plan 13.4). The slug is not editable; admins
// cannot make the group more open (the server refuses).
export default async function GroupSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const { slug } = await params;
  const group = await getCommunityGroup(slug);
  if (!group) notFound();
  const role = await getViewerGroupRole(group.id);
  if (role !== "owner" && role !== "admin") redirect(`/community/groups/${group.slug}`);

  return (
    <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3"><Link href={`/community/groups/${group.slug}`}><ArrowLeft className="mr-2 h-4 w-4" />{group.name}</Link></Button>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Group settings</h1>
        <p className="mt-2 text-sm text-on-surface-variant">Changes are recorded in the group&apos;s moderation log.</p>
        <div className="mt-8 rounded-[2rem] bg-surface-container-lowest p-6 shadow-sm ghost-border sm:p-8">
          <h2 className="mb-4 font-heading text-lg font-extrabold">Images</h2>
          <GroupImageManager groupId={group.id} slug={group.slug} avatarUrl={group.avatar_url} coverUrl={group.cover_url} />
        </div>
        <div className="mt-6 rounded-[2rem] bg-surface-container-lowest p-6 shadow-sm ghost-border sm:p-8">
          <GroupSettingsForm
            mode="edit"
            slugForUpdate={group.slug}
            initial={{
              name: group.name,
              description: group.description,
              category: group.category,
              rules: group.rules,
              vehicleMake: group.vehicle_make ?? "",
              vehicleModel: group.vehicle_model ?? "",
              yearStart: group.year_start,
              yearEnd: group.year_end,
              locationRegion: group.location_region ?? "",
              postingPolicy: group.posting_policy === "moderators" ? "moderators" : "members",
              visibility: group.visibility,
              joinPolicy: group.join_policy,
            }}
          />
        </div>
      </div>
    </main>
  );
}
