"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markVehiclePreviouslyOwned } from "@/features/vehicles/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function VehicleSoldAction({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markSold(keepPublicHistory: boolean) {
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await markVehiclePreviouslyOwned(vehicleId, keepPublicHistory);
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Mark as sold</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark this vehicle as sold?</DialogTitle>
          <DialogDescription>
            Active marketplace listings will be closed. This keeps the Garage record under your account and never transfers ownership or private inspection data.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="sm:grid sm:grid-cols-2">
          <Button variant="outline" disabled={saving} onClick={() => markSold(false)}>
            Keep history private
          </Button>
          <Button disabled={saving} onClick={() => markSold(true)}>
            Keep public history
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
