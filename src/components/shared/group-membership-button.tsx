"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useTranslator } from "@/lib/i18n/client";

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
  const uiText = useTranslator();
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
      if (!response.ok || !payload?.data) throw new Error(payload?.error ?? uiText("ui.could_not_update_membership_9b894efaeb"));
      const next = payload.data.status;
      setMembership(next === "active" || next === "requested" || next === "invited" ? next : null);
      setComposing(false);
      setMessage("");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : uiText("ui.could_not_update_membership_9b894efaeb"));
    } finally {
      setLoading(null);
    }
  }

  if (owner) {
    return <Button type="button" variant="outline" disabled>{uiText("ui.group_owner_118962fbe6")}</Button>;
  }

  let control: React.ReactNode;
  if (membership === "active") {
    control = (
      <Button type="button" variant="outline" onClick={() => run("leave")} disabled={loading !== null}>
        {loading ? uiText("ui.updating_0a4e0b71b7") : uiText("ui.leave_group_3475393dbe")}
      </Button>
    );
  } else if (membership === "requested") {
    control = (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-sm font-semibold text-on-surface-variant">{uiText("ui.request_sent_a73f99f6bf")}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => run("cancel_request")} disabled={loading !== null}>
          {loading ? uiText("ui.updating_0a4e0b71b7") : uiText("ui.cancel_request_5619668359")}
        </Button>
      </div>
    );
  } else if (membership === "invited") {
    control = (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" onClick={() => run("accept_invite")} disabled={loading !== null}>
          {loading === "accept_invite" ? uiText("ui.joining_7c56c61fe5") : uiText("ui.accept_invitation_7e17aadc30")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => run("decline_invite")} disabled={loading !== null}>{uiText("ui.decline_a2d285b352")}</Button>
      </div>
    );
  } else if (joinPolicy === "open") {
    control = (
      <Button type="button" onClick={() => run("join")} disabled={loading !== null}>
        {loading ? uiText("ui.updating_0a4e0b71b7") : uiText("ui.join_group_48a2587a6c")}
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
          placeholder={uiText("ui.optional_note_for_the_moderators_2e8dae77ec")}
          aria-label={uiText("ui.note_for_the_moderators_cc9e2f74dd")}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setComposing(false)} disabled={loading !== null}>{uiText("ui.cancel_19766ed6cc")}</Button>
          <Button type="submit" size="sm" disabled={loading !== null}>{loading ? uiText("ui.sending_286a3af734") : uiText("ui.send_request_3a69f89729")}</Button>
        </div>
      </form>
    ) : (
      <Button type="button" onClick={() => setComposing(true)}>{uiText("ui.request_to_join_dc80ecbe94")}</Button>
    );
  } else {
    control = <Button type="button" variant="outline" disabled>{uiText("ui.invite_only_8e76da24ab")}</Button>;
  }

  return (
    <div className="space-y-2">
      {control}
      {error ? <p className="max-w-xs text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
