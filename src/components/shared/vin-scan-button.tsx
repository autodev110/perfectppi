"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t as uiText } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

export interface DecodedVinVehicle {
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  /** Factory values in the shape of the current-build fields (Renditions doc). */
  factory_summary?: { engine: string | null; transmission: string | null; drivetrain: string | null; body_style: string | null; trim: string | null } | null;
}

interface VinScanButtonProps {
  onDecoded: (vehicle: DecodedVinVehicle) => void;
  className?: string;
  label?: string;
}

export function VinScanButton({
  onDecoded,
  className,
  label = uiText("ui.scan_vin_5074b45d61"),
}: VinScanButtonProps) {
  const uiText = useTranslator();
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function scan(file: File | undefined) {
    if (!file || scanning) return;
    setScanning(true);
    setError(null);

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/vehicles/scan-vin", { method: "POST", body });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? uiText("ui.could_not_scan_that_vin_photo_ab1fb71b14"));
      }
      onDecoded(payload.data as DecodedVinVehicle);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : uiText("ui.could_not_scan_that_vin_photo_ab1fb71b14"));
    } finally {
      setScanning(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => void scan(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={scanning}
      >
        {scanning ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Camera className="mr-2 h-4 w-4" />
        )}
        {scanning ? uiText("ui.reading_vin_84405d096f") : label}
      </Button>
      {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
