"use client";

import { useState } from "react";
import { updateVehicle } from "@/features/vehicles/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useTranslator } from "@/lib/i18n/client";

export function VehicleNotesForm({ vehicleId, initialNotes }: { vehicleId: string; initialNotes: string }) {
  const uiText = useTranslator();
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(formData: FormData) {
    setSaving(true);
    setMessage(null);
    const result = await updateVehicle(vehicleId, formData);
    setSaving(false);
    setMessage(result?.error ?? uiText("ui.notes_saved_c025c3c9fa"));
  }

  return (
    <form action={save} className="space-y-3">
      <Textarea
        name="notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={5}
        maxLength={5000}
        placeholder={uiText("ui.maintenance_reminders_ownership_details_plan_b8e3195d5d")}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{notes.length}/5000</span>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? uiText("ui.saving_dc85af8f2b") : uiText("ui.save_notes_6839da3163")}
        </Button>
      </div>
      {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
    </form>
  );
}
