"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

import { useTranslator } from "@/lib/i18n/client";

export function MemberSafetyActions({
  profileId,
  muted = false,
  compact = false,
}: {
  profileId: string;
  muted?: boolean;
  compact?: boolean;
}) {
  const uiText = useTranslator();
  const router = useRouter();
  const [busy, setBusy] = useState<"block" | "mute" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(kind: "block" | "mute", enabled: boolean) {
    if (kind === "block" && enabled && !window.confirm(uiText("ui.block_this_member_you_will_no_longer_see_or__00fc9f40a3"))) return;
    setBusy(kind);
    setError(null);
    const response = await fetch("/api/social/relationships", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, kind, enabled }),
    });
    if (!response.ok) setError(uiText("ui.this_setting_could_not_be_changed_351970443c"));
    else router.refresh();
    setBusy(null);
  }

  return (
    <div className={compact ? "flex items-center gap-1" : "flex flex-wrap items-center gap-2"}>
      <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => update("mute", !muted)}>
        {busy === "mute" ? uiText("ui.saving_dc85af8f2b") : muted ? uiText("ui.unmute_ce4ee4efc5") : uiText("ui.mute_8dd6857baf")}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => update("block", true)}>
        {busy === "block" ? uiText("ui.blocking_2974ebaf6c") : uiText("ui.block_211d0bb8cf")}
      </Button>
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
