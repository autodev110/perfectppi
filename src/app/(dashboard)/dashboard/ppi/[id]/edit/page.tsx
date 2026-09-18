"use client";
import { t } from "@/lib/i18n";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { resubmitPpi } from "@/features/ppi/actions";
import { RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

import { useTranslator } from "@/lib/i18n/client";

export default function EditInspectionPage() {
  const uiText = useTranslator();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function createNewVersion() {
      const result = await resubmitPpi(id);
      if ("error" in result) {
        setError(result.error ?? t("ui.unknown_error_27c2ccd962"));
        setStatus("error");
        return;
      }
      // Redirect to inspect page with the new submission
      router.replace(
        `/dashboard/ppi/${id}/inspect?sub=${result.data?.submissionId}`
      );
    }
    createNewVersion();
  }, [id, router]);

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-6">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div>
          <h2 className="text-xl font-bold mb-2">{uiText("ui.could_not_start_edit_50023b1ce4")}</h2>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/dashboard/ppi/${id}`}>{uiText("ui.back_to_inspection_9e8649f821")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <RefreshCw className="h-10 w-10 text-primary animate-spin" />
      <p className="text-muted-foreground font-medium">{uiText("ui.creating_new_version_b962f3a7ef")}</p>
    </div>
  );
}
