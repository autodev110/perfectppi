"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { FriendAction, FriendRelationshipState } from "@/features/social/friends";

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
  const router = useRouter();
  const [state, setState] = useState<FriendRelationshipState>(initialState);
  const [busy, setBusy] = useState<FriendAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A server refresh can change the relationship outside this component
  // (for example, a crossed request); keep the control canonical.
  useEffect(() => setState(initialState), [initialState]);

  if (state === "self" || state === "blocked" || (!enabled && state === "none")) return null;

  async function run(action: FriendAction) {
    if (action === "remove" && !window.confirm("Remove this friend? They will lose access to your friends-only posts.")) return;
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
        setError(json?.error ?? "This could not be changed right now.");
      } else {
        setState(json.data.state);
        router.refresh();
      }
    } catch {
      setError("This could not be changed right now. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const size = compact ? "sm" : "default";
  return (
    <div className={compact ? "flex items-center gap-1" : "flex flex-wrap items-center gap-2"}>
      {state === "none" ? (
        <Button type="button" size={size} disabled={busy !== null} onClick={() => run("request")}>
          {busy === "request" ? "Sending..." : "Add friend"}
        </Button>
      ) : null}
      {state === "outgoing_request" ? (
        <Button type="button" size={size} variant="outline" disabled={busy !== null} onClick={() => run("cancel")}>
          {busy === "cancel" ? "Cancelling..." : "Request sent · Cancel"}
        </Button>
      ) : null}
      {state === "incoming_request" ? (
        <>
          {enabled ? (
            <Button type="button" size={size} disabled={busy !== null} onClick={() => run("accept")}>
              {busy === "accept" ? "Accepting..." : "Accept"}
            </Button>
          ) : null}
          <Button type="button" size={size} variant="ghost" disabled={busy !== null} onClick={() => run("decline")}>
            {busy === "decline" ? "Declining..." : "Decline"}
          </Button>
        </>
      ) : null}
      {state === "friends" ? (
        <Button type="button" size={size} variant="outline" disabled={busy !== null} onClick={() => run("remove")}>
          {busy === "remove" ? "Removing..." : "Friends · Remove"}
        </Button>
      ) : null}
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
