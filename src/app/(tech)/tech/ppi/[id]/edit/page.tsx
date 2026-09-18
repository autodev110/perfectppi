"use client";
import { t } from "@/lib/i18n";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resubmitPpi } from "@/features/ppi/actions";

import { useTranslator } from "@/lib/i18n/client";

export default function EditTechInspectionPage() {
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

      router.replace(`/tech/ppi/${id}/inspect?sub=${result.data?.submissionId}`);
    }

    createNewVersion();
  }, [id, router]);

  if (status === "error") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 text-center">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div>
          <h2 className="mb-2 text-xl font-bold">{uiText("ui.could_not_start_edit_50023b1ce4")}</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/tech/ppi/${id}`}>{uiText("ui.back_to_inspection_9e8649f821")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <RefreshCw className="h-10 w-10 animate-spin text-primary" />
      <p className="font-medium text-muted-foreground">{uiText("ui.creating_new_version_b962f3a7ef")}</p>
    </div>
  );
}
