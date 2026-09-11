"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type MembershipStatus = "active" | "requested" | "invited" | null;
type JoinPolicy = "open" | "request_approval" | "invite_only";
type Action = "join" | "leave" | "request" | "cancel_request" | "accept_invite" | "decline_invite";

// Membership control for one group (plan 13.3): join / leave for Open
// groups, request → pending → cancel for Request-approval groups, and
// accept / decline for invitations. Invite-only groups without an
// invitation show why the viewer cannot join.
export function GroupMembershipButton({
  groupId,
  initialJoined,
  status,
  joinPolicy = "open",
  owner = false,
}: {
  groupId: string;
  /** Legacy prop; `status` wins when provided. */
  initialJoined?: boolean;
  status?: MembershipStatus;
  joinPolicy?: JoinPolicy;
  owner?: boolean;
}) {
  const router = useRouter();
  const [membership, setMembership] = useState<MembershipStatus>(status ?? (initialJoined ? "active" : null));
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action) {
    setLoading(action);
    setError(null);
    try {
      const response = await fetch(`/api/community/groups/${groupId}/membership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "request" ? { action, message: message.trim() || undefined } : { action }),
      });
      const payload = (await response.json().catch(() => null)) as { data?: { status: string }; error?: string } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error ?? "Could not update membership");
      const next = payload.data.status;
      setMembership(next === "active" || next === "requested" || next === "invited" ? next : null);
      setComposing(false);
      setMessage("");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update membership");
    } finally {
      setLoading(null);
    }
  }

  if (owner) {
    return <Button type="button" variant="outline" disabled>Group owner</Button>;
  }

  let control: React.ReactNode;
  if (membership === "active") {
    control = (
      <Button type="button" variant="outline" onClick={() => run("leave")} disabled={loading !== null}>
        {loading ? "Updating..." : "Leave group"}
      </Button>
    );
  } else if (membership === "requested") {
    control = (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-sm font-semibold text-on-surface-variant">Request sent</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => run("cancel_request")} disabled={loading !== null}>
          {loading ? "Updating..." : "Cancel request"}
        </Button>
      </div>
    );
  } else if (membership === "invited") {
    control = (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" onClick={() => run("accept_invite")} disabled={loading !== null}>
          {loading === "accept_invite" ? "Joining..." : "Accept invitation"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => run("decline_invite")} disabled={loading !== null}>Decline</Button>
      </div>
    );
  } else if (joinPolicy === "open") {
    control = (
      <Button type="button" onClick={() => run("join")} disabled={loading !== null}>
        {loading ? "Updating..." : "Join group"}
      </Button>
    );
  } else if (joinPolicy === "request_approval") {
    control = composing ? (
      <form
        className="w-full max-w-xs space-y-2"
        onSubmit={(event) => { event.preventDefault(); void run("request"); }}
      >
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={300}
          rows={2}
          placeholder="Optional note for the moderators"
          aria-label="Note for the moderators"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setComposing(false)} disabled={loading !== null}>Cancel</Button>
          <Button type="submit" size="sm" disabled={loading !== null}>{loading ? "Sending..." : "Send request"}</Button>
        </div>
      </form>
    ) : (
      <Button type="button" onClick={() => setComposing(true)}>Request to join</Button>
    );
  } else {
    control = <Button type="button" variant="outline" disabled>Invite only</Button>;
  }

  return (
    <div className="space-y-2">
      {control}
      {error ? <p className="max-w-xs text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
