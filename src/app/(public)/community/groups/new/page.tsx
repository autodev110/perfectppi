import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { groupCreationEnabled } from "@/features/social/group-create";
import { Button } from "@/components/ui/button";
import { GroupSettingsForm } from "@/components/shared/group-settings-form";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// Plan 13.2: member group creation (Public / Open in this release).
export default async function NewGroupPage() {
  await requireRole(["consumer", "technician", "org_manager", "admin"]);
  const enabled = await groupCreationEnabled();

  return (
    <main className="min-h-screen bg-surface px-6 pb-20 pt-24 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <Button asChild variant="ghost" className="mb-5 -ml-3"><Link href="/community/groups"><ArrowLeft className="mr-2 h-4 w-4" />All groups</Link></Button>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight">Create a group</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          A place for owners, buyers, and technicians around one make, model, discipline, or local scene. You become the owner and can appoint moderators.
        </p>
        <div className="mt-8 rounded-[2rem] bg-surface-container-lowest p-6 shadow-sm ghost-border sm:p-8">
          {enabled ? (
            <GroupSettingsForm
              mode="create"
              initial={{ slug: "", name: "", description: "", category: "general", rules: [], vehicleMake: "", vehicleModel: "", yearStart: null, yearEnd: null, locationRegion: "", postingPolicy: "members" }}
            />
          ) : (
            <p className="text-sm text-on-surface-variant">Creating groups is not available yet. You can join any existing group in the meantime.</p>
          )}
        </div>
      </div>
    </main>
  );
}
