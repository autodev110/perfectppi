"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteVehicle } from "@/features/vehicles/actions";
import { Button } from "@/components/ui/button";

import { useTranslator } from "@/lib/i18n/client";

export function VehicleDeleteButton({ vehicleId }: { vehicleId: string }) {
  const uiText = useTranslator();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(uiText("ui.are_you_sure_you_want_to_delete_this_vehicle_85d0ef56f6"))) return;
    setDeleting(true);
    setError(null);
    const result = await deleteVehicle(vehicleId);
    if (result?.error) {
      setError(result.error);
      setDeleting(false);
      return;
    }
    router.push("/dashboard/vehicles");
    router.refresh();
  }

  return (
    <div className="space-y-2 text-center">
      <Button type="button" variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive" onClick={remove} disabled={deleting}>
        {deleting ? uiText("ui.deleting_685ecb984a") : uiText("ui.delete_vehicle_e428704ae6")}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
