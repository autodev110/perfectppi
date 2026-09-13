"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { claimVehicleHandoff } from "@/features/vehicles/handoff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function VehicleClaimForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [vin, setVin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await claimVehicleHandoff({ code, vin });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.data?.vehicleId) router.push(`/dashboard/vehicles/${result.data.vehicleId}/edit`);
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="claim-code">Seller claim code</Label>
        <Input
          id="claim-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="ABCD-EFGH-JKLM"
          autoCapitalize="characters"
          autoComplete="off"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="claim-vin">Full VIN</Label>
        <Input
          id="claim-vin"
          value={vin}
          onChange={(event) => setVin(event.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "").slice(0, 17))}
          placeholder="17-character VIN"
          autoCapitalize="characters"
          autoComplete="off"
          minLength={17}
          maxLength={17}
          required
        />
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
        A successful claim creates a new private record with vehicle identity and configuration. Seller photos, mileage, reports, inspections, notes, receipts, posts, and maintenance records are not copied. This is not proof of legal title.
      </div>
      <Button type="submit" disabled={busy || vin.length !== 17 || !code.trim()}>
        {busy ? "Verifying..." : "Verify and create Garage record"}
      </Button>
    </form>
  );
}
