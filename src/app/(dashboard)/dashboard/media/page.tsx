import Link from "next/link";
import { requireRole } from "@/features/auth/guards";
import { getMyPackages } from "@/features/media/queries";
import { Button } from "@/components/ui/button";
import { MediaPackagesManager } from "@/components/shared/media-packages-manager";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function MediaPackagesPage() {
  const uiText = await getRequestTranslator();
  await requireRole(["consumer"]);
  const packages = await getMyPackages();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{uiText("ui.media_packages_05d6f1c793")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{uiText("ui.curate_files_and_generate_shareable_links_bd6d692634")}</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/media/new">{uiText("ui.create_package_0f4fd87bb3")}</Link>
        </Button>
      </div>

      <MediaPackagesManager packages={packages} />
    </div>
  );
}
