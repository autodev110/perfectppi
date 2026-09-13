"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        <Label htmlFor="make">Make *</Label>
        <Input id="make" name="make" list={makeListId} placeholder="Start typing a make" required value={make} onChange={(event) => onMakeChange(event.target.value)} autoComplete="off" />
        <datalist id={makeListId}>{makes.map((value) => <option key={value} value={value} />)}</datalist>
      </div>
      <div className="space-y-2">
        <Label htmlFor="model">Model *</Label>
        <Input id="model" name="model" list={modelListId} placeholder={make ? "Start typing a model" : "Choose a make first"} required value={model} onChange={(event) => onModelChange(event.target.value)} autoComplete="off" />
        <datalist id={modelListId}>{models.map((value) => <option key={value} value={value} />)}</datalist>
      </div>
    </>
  );
}
