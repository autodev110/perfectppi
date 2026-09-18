"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useTranslator } from "@/lib/i18n/client";

export function VehicleMakeModelFields({
  make,
  model,
  year,
  onMakeChange,
  onModelChange,
}: {
  make: string;
  model: string;
  year: string;
  onMakeChange: (value: string) => void;
  onModelChange: (value: string) => void;
}) {
  const uiText = useTranslator();
  const makeListId = useId();
  const modelListId = useId();
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ kind: "makes", q: make });
      // Suggestions are a convenience; typing works without them, and an
      // aborted request (fast typing) must not surface as an error.
      const response = await fetch(`/api/vehicles/catalog?${params}`, { signal: controller.signal }).catch(() => null);
      if (!response?.ok) return;
      const payload = await response.json() as { data?: string[] };
      setMakes(payload.data ?? []);
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [make]);

  useEffect(() => {
    if (!make.trim()) { setModels([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ kind: "models", make: make.trim(), q: model });
      if (/^\d{4}$/.test(year)) params.set("year", year);
      const response = await fetch(`/api/vehicles/catalog?${params}`, { signal: controller.signal }).catch(() => null);
      if (!response?.ok) return;
      const payload = await response.json() as { data?: string[] };
      setModels(payload.data ?? []);
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [make, model, year]);

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="make">{uiText("ui.make_a84829365b")}</Label>
        <Input id="make" name="make" list={makeListId} placeholder={uiText("ui.start_typing_a_make_d82304e01c")} required value={make} onChange={(event) => onMakeChange(event.target.value)} autoComplete="off" />
        <datalist id={makeListId}>{makes.map((value) => <option key={value} value={value} />)}</datalist>
      </div>
      <div className="space-y-2">
        <Label htmlFor="model">{uiText("ui.model_e32f13b58d")}</Label>
        <Input id="model" name="model" list={modelListId} placeholder={make ? uiText("ui.start_typing_a_model_439bd58047") : uiText("ui.choose_a_make_first_0b1360614d")} required value={model} onChange={(event) => onModelChange(event.target.value)} autoComplete="off" />
        <datalist id={modelListId}>{models.map((value) => <option key={value} value={value} />)}</datalist>
      </div>
    </>
  );
}
