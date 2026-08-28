"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DecodedVinVehicle {
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
}

interface VinScanButtonProps {
  onDecoded: (vehicle: DecodedVinVehicle) => void;
  className?: string;
  label?: string;
}

export function VinScanButton({
  onDecoded,
  className,
  label = "Scan VIN",
}: VinScanButtonProps) {
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
        throw new Error(payload?.error ?? "Could not scan that VIN photo");
      }
      onDecoded(payload.data as DecodedVinVehicle);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Could not scan that VIN photo");
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
        {scanning ? "Reading VIN..." : label}
      </Button>
      {error && <p className="mt-2 text-sm font-medium text-destructive">{error}</p>}
    </div>
  );
}
