"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function MemberSafetyActions({
  profileId,
  muted = false,
  compact = false,
}: {
  profileId: string;
  muted?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"block" | "mute" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(kind: "block" | "mute", enabled: boolean) {
    if (kind === "block" && enabled && !window.confirm("Block this member? You will no longer see or be able to contact each other.")) return;
    setBusy(kind);
    setError(null);
    const response = await fetch("/api/social/relationships", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, kind, enabled }),
    });
    if (!response.ok) setError("This setting could not be changed.");
    else router.refresh();
    setBusy(null);
  }

  return (
    <div className={compact ? "flex items-center gap-1" : "flex flex-wrap items-center gap-2"}>
      <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => update("mute", !muted)}>
        {busy === "mute" ? "Saving..." : muted ? "Unmute" : "Mute"}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => update("block", true)}>
        {busy === "block" ? "Blocking..." : "Block"}
      </Button>
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
