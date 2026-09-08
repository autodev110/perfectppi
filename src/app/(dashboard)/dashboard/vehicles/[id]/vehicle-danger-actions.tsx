"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteVehicle } from "@/features/vehicles/actions";
import { Button } from "@/components/ui/button";

export function VehicleDeleteButton({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm("Are you sure you want to delete this vehicle? Its inspections, reports, listings, notes, and media will also be deleted. This cannot be undone.")) return;
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
        {deleting ? "Deleting..." : "Delete vehicle"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
