"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

import { useTranslator } from "@/lib/i18n/client";

export function InspectionDeleteButton({
  inspectionId,
  redirectTo,
}: {
  inspectionId: string;
  redirectTo?: string;
}) {
  const uiText = useTranslator();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(uiText("ui.delete_this_inspection_and_its_reports_this__824c7e1125"))) return;
    setDeleting(true);
    setError(null);
    const response = await fetch(`/api/ppi/requests/${inspectionId}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? uiText("ui.the_inspection_could_not_be_deleted_please_t_9d0583a877"));
      setDeleting(false);
      return;
    }
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="space-y-1 text-center">
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={remove} disabled={deleting}>
        {deleting ? uiText("ui.deleting_685ecb984a") : uiText("ui.delete_inspection_8932d2c8e7")}
      </Button>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
