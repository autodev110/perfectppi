"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function InspectionDeleteButton({
  inspectionId,
  redirectTo,
}: {
  inspectionId: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm("Delete this inspection and its reports? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    const response = await fetch(`/api/ppi/requests/${inspectionId}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? "The inspection could not be deleted. Please try again.");
      setDeleting(false);
      return;
    }
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="space-y-1 text-center">
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={remove} disabled={deleting}>
        {deleting ? "Deleting..." : "Delete inspection"}
      </Button>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
