"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resubmitPpi } from "@/features/ppi/actions";

export default function EditTechInspectionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function createNewVersion() {
      const result = await resubmitPpi(id);
      if ("error" in result) {
        setError(result.error ?? "Unknown error");
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
          <h2 className="mb-2 text-xl font-bold">Could not start edit</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/tech/ppi/${id}`}>Back to Inspection</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <RefreshCw className="h-10 w-10 animate-spin text-primary" />
      <p className="font-medium text-muted-foreground">Creating new version…</p>
    </div>
  );
}
