import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { getMyPackages } from "@/features/media/queries";
import { Button } from "@/components/ui/button";
import { MediaPackagesManager } from "@/components/shared/media-packages-manager";

export default async function MediaPackagesPage() {
  await requireRole(["consumer"]);
  const packages = await getMyPackages();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Media Packages</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Curate files and generate shareable links.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/media/new">Create Package</Link>
        </Button>
      </div>

      <MediaPackagesManager packages={packages} />
    </div>
  );
}
