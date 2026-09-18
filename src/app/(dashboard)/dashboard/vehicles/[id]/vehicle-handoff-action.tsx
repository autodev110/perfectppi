"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { issueVehicleHandoffClaim } from "@/features/vehicles/handoff";
import { Button } from "@/components/ui/button";

import { useTranslator } from "@/lib/i18n/client";

export function VehicleHandoffAction({
  vehicleId,
  vehicleLabel,
  hasVin,
}: {
  vehicleId: string;
  vehicleLabel: string;
  hasVin: boolean;
}) {
  const uiText = useTranslator();
  const [claim, setClaim] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await issueVehicleHandoffClaim(vehicleId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setClaim(result.data ?? null);
  }

  async function copyCode() {
    if (!claim) return;
    await navigator.clipboard.writeText(claim.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (!hasVin) {
    return <p className="text-sm text-muted-foreground">{uiText("ui.add_the_complete_vin_before_creating_a_buyer_1080c5e621")}</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">{uiText("ui.let_the_buyer_create_their_own_private_30d29ebcef")}{vehicleLabel}{uiText("ui.garage_record_c81d6b8a67")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{uiText("ui.they_must_enter_this_one_time_code_and_the_m_8bafc55dce")}</p>
      </div>
      {claim ? (
        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{uiText("ui.buyer_claim_code_2b60fd5cd1")}</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-wider">{claim.code}</p>
          <p className="mt-1 text-xs text-muted-foreground">{uiText("ui.expires_d970e4fd10")}{new Date(claim.expiresAt).toLocaleString()}{uiText("ui.creating_another_code_revokes_this_one_bcbc20d974")}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={copyCode}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? uiText("ui.copied_8d525e5f15") : uiText("ui.copy_code_49a0053f3b")}
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" variant="outline" disabled={busy} onClick={issue}>
        <KeyRound className="mr-2 h-4 w-4" />
        {busy ? uiText("ui.creating_code_45bbaf30c6") : claim ? uiText("ui.create_a_new_code_dae5fe23b7") : uiText("ui.create_buyer_claim_code_b6ca99a01e")}
      </Button>
      <p className="text-xs text-muted-foreground">{uiText("ui.this_verifies_a_handoff_inside_perfectppi_it_ad0c5c119b")}</p>
    </div>
  );
}
