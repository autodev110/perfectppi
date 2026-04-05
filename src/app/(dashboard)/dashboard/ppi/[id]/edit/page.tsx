"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { resubmitPpi } from "@/features/ppi/actions";
import { RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function EditInspectionPage() {
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
          <h2 className="text-xl font-bold mb-2">Could not start edit</h2>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/dashboard/ppi/${id}`}>Back to Inspection</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <RefreshCw className="h-10 w-10 text-primary animate-spin" />
      <p className="text-muted-foreground font-medium">Creating new version…</p>
    </div>
  );
}
