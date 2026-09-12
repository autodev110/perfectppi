"use client";

import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BuildSubscriptionButton({ vehicleId, initialSubscribed }: { vehicleId: string; initialSubscribed: boolean }) {
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (busy) return;
    const previous = subscribed;
    const next = !previous;
    setSubscribed(next);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/vehicles/${vehicleId}/build-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribed: next }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not update build notifications");
      setSubscribed(payload.data.subscribed);
    } catch (caught) {
      setSubscribed(previous);
      setError(caught instanceof Error ? caught.message : "Could not update build notifications");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="outline" size="sm" onClick={() => void toggle()} disabled={busy} aria-pressed={subscribed}>
        {subscribed ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {subscribed ? "Stop build updates" : "Subscribe to build updates"}
      </Button>
      {error ? <p className="mt-1 text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
