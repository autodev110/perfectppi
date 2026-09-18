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

import { useTranslator } from "@/lib/i18n/client";

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
  const uiText = useTranslator();
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
        <Button variant="outline" size="sm">{uiText("ui.mark_as_sold_1f17d23325")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{uiText("ui.mark_this_vehicle_as_sold_0feeaa404c")}</DialogTitle>
          <DialogDescription>{uiText("ui.active_marketplace_listings_will_be_closed_t_7e180c1f1b")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 rounded-xl border bg-muted/40 p-4 text-sm">
          <p className="font-semibold">{uiText("ui.public_history_preview_ce19d0a4d1")}</p>
          <p className="text-muted-foreground">{uiText("ui.if_you_keep_history_public_people_can_see_54d890f15f")}{preview.nickname ? uiText("ui.text_e18b2e1096", { arg0: String(preview.nickname), arg1: String(preview.vehicleLabel) }) : preview.vehicleLabel}{uiText("ui.its_public_owner_attribution_and_258cde828a")}</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {preview.details.map((detail) => <li key={detail}>{detail}</li>)}
            <li>{preview.mediaCount}{uiText("ui.approved_public_media_item_a8f12596fc")}{preview.mediaCount === 1 ? "" : uiText("ui.s_043a718774")}</li>
            <li>{preview.buildCount}{uiText("ui.public_build_entr_f862b18d90")}{preview.buildCount === 1 ? uiText("ui.y_a1fce43638") : uiText("ui.ies_388f91ea04")}</li>
            <li>{preview.maintenanceCount}{uiText("ui.public_maintenance_entr_42321491b5")}{preview.maintenanceCount === 1 ? uiText("ui.y_a1fce43638") : uiText("ui.ies_388f91ea04")}</li>
          </ul>
          <p className="text-xs text-muted-foreground">{uiText("ui.full_vin_notes_receipts_private_timeline_ent_956cc10223")}</p>
          <label className="flex items-start gap-2 font-medium">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={publicConsent}
              onChange={(event) => setPublicConsent(event.target.checked)}
            />{uiText("ui.i_reviewed_this_preview_and_consent_to_keepi_a6c5a78c96")}</label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="sm:grid sm:grid-cols-2">
          <Button variant="outline" disabled={saving} onClick={() => markSold(false)}>{uiText("ui.keep_history_private_223e0cb9f9")}</Button>
          <Button disabled={saving || !publicConsent} onClick={() => markSold(true)}>{uiText("ui.consent_and_keep_public_4babc595d8")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
