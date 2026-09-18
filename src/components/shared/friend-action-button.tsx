"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { FriendAction, FriendRelationshipState } from "@/features/social/friends";

import { useTranslator } from "@/lib/i18n/client";

// Renders the one friendship control that fits the current relationship and
// applies the canonical state the server returns (plan 10.1/10.2). Errors
// show the server's message; nothing is claimed optimistically.
export function FriendActionButton({
  profileId,
  state: initialState,
  enabled = true,
  compact = false,
}: {
  profileId: string;
  state: FriendRelationshipState;
  enabled?: boolean;
  compact?: boolean;
}) {
  const uiText = useTranslator();
  const router = useRouter();
  const [state, setState] = useState<FriendRelationshipState>(initialState);
  const [busy, setBusy] = useState<FriendAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A server refresh can change the relationship outside this component
  // (for example, a crossed request); keep the control canonical.
  useEffect(() => setState(initialState), [initialState]);

  if (state === "self" || state === "blocked" || (!enabled && state === "none")) return null;

  async function run(action: FriendAction) {
    if (action === "remove" && !window.confirm(uiText("ui.remove_this_friend_they_will_lose_access_to__51485e24cd"))) return;
    setBusy(action);
    setError(null);
    try {
      const response = await fetch("/api/social/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, action }),
      });
      const json = (await response.json().catch(() => null)) as
        | { data?: { state: FriendRelationshipState }; error?: string }
        | null;
      if (!response.ok || !json?.data) {
        setError(json?.error ?? uiText("ui.this_could_not_be_changed_right_now_8c6eb4f457"));
      } else {
        setState(json.data.state);
        router.refresh();
      }
    } catch {
      setError(uiText("ui.this_could_not_be_changed_right_now_check_yo_5ac77b0f63"));
    } finally {
      setBusy(null);
    }
  }

  const size = compact ? "sm" : "default";
  return (
    <div className={compact ? "flex items-center gap-1" : "flex flex-wrap items-center gap-2"}>
      {state === "none" ? (
        <Button type="button" size={size} disabled={busy !== null} onClick={() => run("request")}>
          {busy === "request" ? uiText("ui.sending_286a3af734") : uiText("ui.add_friend_c1f8728197")}
        </Button>
      ) : null}
      {state === "outgoing_request" ? (
        <Button type="button" size={size} variant="outline" disabled={busy !== null} onClick={() => run("cancel")}>
          {busy === "cancel" ? uiText("ui.cancelling_7b26131098") : uiText("ui.request_sent_cancel_c09633b324")}
        </Button>
      ) : null}
      {state === "incoming_request" ? (
        <>
          {enabled ? (
            <Button type="button" size={size} disabled={busy !== null} onClick={() => run("accept")}>
              {busy === "accept" ? uiText("ui.accepting_31409c7789") : uiText("ui.accept_89713b9c9c")}
            </Button>
          ) : null}
          <Button type="button" size={size} variant="ghost" disabled={busy !== null} onClick={() => run("decline")}>
            {busy === "decline" ? uiText("ui.declining_4b1846c719") : uiText("ui.decline_a2d285b352")}
          </Button>
        </>
      ) : null}
      {state === "friends" ? (
        <Button type="button" size={size} variant="outline" disabled={busy !== null} onClick={() => run("remove")}>
          {busy === "remove" ? uiText("ui.removing_60d18e42fd") : uiText("ui.friends_remove_3c53a692df")}
        </Button>
      ) : null}
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
