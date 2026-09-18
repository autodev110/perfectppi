"use client";

import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";

import { useTranslator } from "@/lib/i18n/client";

export function BuildSubscriptionButton({ vehicleId, initialSubscribed }: { vehicleId: string; initialSubscribed: boolean }) {
  const uiText = useTranslator();
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
      if (!response.ok) throw new Error(payload.error ?? uiText("ui.could_not_update_build_notifications_00b2c7db8a"));
      setSubscribed(payload.data.subscribed);
    } catch (caught) {
      setSubscribed(previous);
      setError(caught instanceof Error ? caught.message : uiText("ui.could_not_update_build_notifications_00b2c7db8a"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button variant="outline" size="sm" onClick={() => void toggle()} disabled={busy} aria-pressed={subscribed}>
        {subscribed ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {subscribed ? uiText("ui.stop_build_updates_208c665e39") : uiText("ui.subscribe_to_build_updates_a784f6cd01")}
      </Button>
      {error ? <p className="mt-1 text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
