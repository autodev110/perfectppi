"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { issueVehicleHandoffClaim } from "@/features/vehicles/handoff";
import { Button } from "@/components/ui/button";

export function VehicleHandoffAction({
  vehicleId,
  vehicleLabel,
  hasVin,
}: {
  vehicleId: string;
  vehicleLabel: string;
  hasVin: boolean;
}) {
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
    return <p className="text-sm text-muted-foreground">Add the complete VIN before creating a buyer claim code.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Let the buyer create their own private {vehicleLabel} Garage record.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          They must enter this one-time code and the matching full VIN. This copies vehicle identity and configuration only; your photos, mileage, inspections, reports, notes, receipts, posts, and maintenance history do not transfer.
        </p>
      </div>
      {claim ? (
        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Buyer claim code</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-wider">{claim.code}</p>
          <p className="mt-1 text-xs text-muted-foreground">Expires {new Date(claim.expiresAt).toLocaleString()}. Creating another code revokes this one.</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={copyCode}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? "Copied" : "Copy code"}
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" variant="outline" disabled={busy} onClick={issue}>
        <KeyRound className="mr-2 h-4 w-4" />
        {busy ? "Creating code..." : claim ? "Create a new code" : "Create buyer claim code"}
      </Button>
      <p className="text-xs text-muted-foreground">This verifies a handoff inside PerfectPPI; it is not proof of legal title or registration.</p>
    </div>
  );
}
