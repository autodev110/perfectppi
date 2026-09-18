"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { claimVehicleHandoff } from "@/features/vehicles/handoff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useTranslator } from "@/lib/i18n/client";

export function VehicleClaimForm() {
  const uiText = useTranslator();
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
        <Label htmlFor="claim-code">{uiText("ui.seller_claim_code_53fce86e38")}</Label>
        <Input
          id="claim-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder={uiText("ui.abcd_efgh_jklm_97bee7fe7d")}
          autoCapitalize="characters"
          autoComplete="off"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="claim-vin">{uiText("ui.full_vin_aabc0964a2")}</Label>
        <Input
          id="claim-vin"
          value={vin}
          onChange={(event) => setVin(event.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "").slice(0, 17))}
          placeholder={uiText("ui.17_character_vin_380e833d76")}
          autoCapitalize="characters"
          autoComplete="off"
          minLength={17}
          maxLength={17}
          required
        />
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">{uiText("ui.a_successful_claim_creates_a_new_private_rec_eb5f23cf2c")}</div>
      <Button type="submit" disabled={busy || vin.length !== 17 || !code.trim()}>
        {busy ? uiText("ui.verifying_2ec1ac7d45") : uiText("ui.verify_and_create_garage_record_6a47a7639c")}
      </Button>
    </form>
  );
}
