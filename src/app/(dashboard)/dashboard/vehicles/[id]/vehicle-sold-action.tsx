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

type PublicHistoryPreview = {
  vehicleLabel: string;
  nickname: string | null;
  details: string[];
  mediaCount: number;
  buildCount: number;
  maintenanceCount: number;
};

export function VehicleSoldAction({
  vehicleId,
  preview,
}: {
  vehicleId: string;
  preview: PublicHistoryPreview;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicConsent, setPublicConsent] = useState(false);

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
        <div className="space-y-3 rounded-xl border bg-muted/40 p-4 text-sm">
          <p className="font-semibold">Public-history preview</p>
          <p className="text-muted-foreground">
            If you keep history public, people can see {preview.nickname ? `${preview.nickname} (${preview.vehicleLabel})` : preview.vehicleLabel}, its public owner attribution, and:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {preview.details.map((detail) => <li key={detail}>{detail}</li>)}
            <li>{preview.mediaCount} approved public media item{preview.mediaCount === 1 ? "" : "s"}</li>
            <li>{preview.buildCount} public build entr{preview.buildCount === 1 ? "y" : "ies"}</li>
            <li>{preview.maintenanceCount} public maintenance entr{preview.maintenanceCount === 1 ? "y" : "ies"}</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Full VIN, notes, receipts, private timeline entries, addresses, keys/codes, and private inspection material remain private.
          </p>
          <label className="flex items-start gap-2 font-medium">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={publicConsent}
              onChange={(event) => setPublicConsent(event.target.checked)}
            />
            I reviewed this preview and consent to keeping these permitted details public.
          </label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="sm:grid sm:grid-cols-2">
          <Button variant="outline" disabled={saving} onClick={() => markSold(false)}>
            Keep history private
          </Button>
          <Button disabled={saving || !publicConsent} onClick={() => markSold(true)}>
            Consent and keep public
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
