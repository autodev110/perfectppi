"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { GroupModerationAction } from "@/features/social/group-tools";
import { t as uiText } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

// Owner/moderator actions (plan 13.4 / 13.7). Every call goes to the group
// moderation endpoint; the server decides what this member may do.
async function moderate(slug: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/community/groups/${encodeURIComponent(slug)}/moderation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? uiText("ui.the_change_could_not_be_applied_8958e5ba33"));
}

export function GroupPostModerationMenu({
  slug,
  postId,
  pinned,
  removed,
}: {
  slug: string;
  postId: string;
  pinned: boolean;
  removed: boolean;
}) {
  const uiText = useTranslator();
  const router = useRouter();
  const [busy, setBusy] = useState<GroupModerationAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: GroupModerationAction) {
    let reason: string | undefined;
    if (action === "remove_post") {
      const answer = window.prompt(uiText("ui.remove_this_post_from_the_group_optional_rea_14270debb7"));
      if (answer === null) return;
      reason = answer.trim() || undefined;
    }
    setBusy(action);
    setError(null);
    try {
      await moderate(slug, { action, postId, reason });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText("ui.the_change_could_not_be_applied_8958e5ba33"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {!removed ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(pinned ? "unpin" : "pin")}>
          {busy === "pin" || busy === "unpin" ? uiText("ui.saving_23e39291d6") : pinned ? uiText("ui.unpin_ee3c716130") : uiText("ui.pin_ff1cee7441")}
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={removed ? "" : "text-destructive hover:text-destructive"}
        disabled={busy !== null}
        onClick={() => run(removed ? "restore_post" : "remove_post")}
      >
        {busy === "remove_post" || busy === "restore_post" ? uiText("ui.saving_23e39291d6") : removed ? uiText("ui.restore_to_group_f9b0ba7a7e") : uiText("ui.remove_from_group_035edd9bd7")}
      </Button>
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

// Role matrix (plan 13.4): owner does everything; admins manage members,
// moderators, and bans but never other admins or ownership; moderators may
// only remove plain members.
export function GroupMemberModerationMenu({
  slug,
  profileId,
  role,
  viewerRole,
  postingRestrictedUntil,
}: {
  slug: string;
  profileId: string;
  role: "owner" | "admin" | "moderator" | "member";
  viewerRole: "owner" | "admin" | "moderator";
  postingRestrictedUntil: string | null;
}) {
  const uiText = useTranslator();
  const router = useRouter();
  const [busy, setBusy] = useState<GroupModerationAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (role === "owner") return null;
  if (viewerRole === "moderator" && role !== "member") return null;
  if (viewerRole === "admin" && role === "admin") return null;
  const canAssignRoles = viewerRole === "owner" || viewerRole === "admin";

  async function run(action: GroupModerationAction, confirmText?: string, extras?: Record<string, unknown>) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    setError(null);
    try {
      await moderate(slug, { action, profileId, ...extras });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText("ui.the_change_could_not_be_applied_8958e5ba33"));
    } finally {
      setBusy(null);
    }
  }

  async function togglePostingRestriction() {
    const restricted = Boolean(postingRestrictedUntil && new Date(postingRestrictedUntil).getTime() > Date.now());
    if (restricted) {
      await run("restore_posting", uiText("ui.restore_this_member_s_ability_to_post_in_the_a575d7ee97"));
      return;
    }
    const reason = window.prompt(uiText("ui.why_are_you_temporarily_pausing_this_member__20b46fb69a"));
    if (!reason?.trim()) return;
    const duration = window.prompt(uiText("ui.how_long_enter_1h_1d_7d_or_30d_27060bb0a0"), "1d")?.trim().toLowerCase();
    const durationSeconds = { "1h": 3600, "1d": 86400, "7d": 604800, "30d": 2592000 }[duration ?? ""];
    if (!durationSeconds) {
      setError(uiText("ui.choose_1h_1d_7d_or_30d_b0d734d7eb"));
      return;
    }
    await run("restrict_posting", undefined, { reason: reason.trim(), durationSeconds });
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {canAssignRoles ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(role === "member" ? "make_moderator" : "make_member")}>
          {role === "member" ? uiText("ui.make_moderator_5258d84b7b") : uiText("ui.make_member_570411a068")}
        </Button>
      ) : null}
      {viewerRole === "owner" && role !== "admin" ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("make_admin", "Make this member an admin? Admins manage members, moderators, posts, and ordinary settings.")}>{uiText("ui.make_admin_34d9bc4dab")}</Button>
      ) : null}
      <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("remove_member", "Remove this member from the group? They can rejoin later.")}>{uiText("ui.remove_c3812fc4ac")}</Button>
      <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={togglePostingRestriction}>
        {postingRestrictedUntil && new Date(postingRestrictedUntil).getTime() > Date.now() ? uiText("ui.restore_posting_b4d9313664") : uiText("ui.pause_posting_f2d1d0e29a")}
      </Button>
      {canAssignRoles ? (
        <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => run("ban_member", "Ban this member? They will not be able to rejoin until unbanned.")}>{uiText("ui.ban_520ed297c9")}</Button>
      ) : null}
      {viewerRole === "owner" ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("transfer_ownership", "Transfer ownership of this group to this member? You will become a moderator.")}>{uiText("ui.make_owner_fdbbb37b6b")}</Button>
      ) : null}
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

export function GroupArchiveButton({ slug }: { slug: string }) {
  const uiText = useTranslator();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    const reason = window.prompt(uiText("ui.archive_this_group_posts_are_preserved_but_n_11fb78641b"));
    if (reason === null) return;
    setBusy(true);
    setError(null);
    try {
      await moderate(slug, { action: "archive", reason: reason.trim() || undefined });
      router.push("/community/groups");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText("ui.the_group_could_not_be_archived_bca9e94565"));
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={busy} onClick={archive}>
        {busy ? uiText("ui.archiving_af9e1c99f1") : uiText("ui.archive_group_3a6563f6ce")}
      </Button>
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

// Approve / decline one pending join request (plan 13.3).
export function GroupJoinRequestControls({ slug, profileId }: { slug: string; profileId: string }) {
  const uiText = useTranslator();
  const router = useRouter();
  const [busy, setBusy] = useState<"approve_request" | "decline_request" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "approve_request" | "decline_request") {
    setBusy(action);
    setError(null);
    try {
      await moderate(slug, { action, profileId });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText("ui.the_change_could_not_be_applied_8958e5ba33"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <Button type="button" size="sm" disabled={busy !== null} onClick={() => run("approve_request")}>
          {busy === "approve_request" ? uiText("ui.approving_e99dcb0a97") : uiText("ui.approve_6007acbe30")}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("decline_request")}>
          {busy === "decline_request" ? uiText("ui.declining_fb03c72b9c") : uiText("ui.decline_a2d285b352")}
        </Button>
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

// Invite a member by username (plan 13.3). The server resolves the username
// and applies the blocked / unavailable and daily-limit rules.
export function GroupInviteForm({ slug }: { slug: string }) {
  const uiText = useTranslator();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const handle = username.trim().replace(/^@/, "");
    if (!handle || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/community/groups/${encodeURIComponent(slug)}/moderation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", username: handle }),
      });
      const payload = (await response.json().catch(() => null)) as { data?: { status?: string; changed?: boolean }; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? uiText("ui.the_invitation_could_not_be_sent_58c9f7499b"));
      const status = payload?.data?.status;
      setNotice({
        tone: "ok",
        text: status === "active"
          ? uiText("ui.is_now_a_member_a50a28376e", { arg0: String(handle) })
          : payload?.data?.changed === false ? uiText("ui.already_has_an_invitation_03e7790adf", { arg0: String(handle) }) : uiText("ui.invitation_sent_to_74a5bd91d6", { arg0: String(handle) }),
      });
      setUsername("");
      router.refresh();
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : uiText("ui.the_invitation_could_not_be_sent_58c9f7499b") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2" aria-label={uiText("ui.invite_a_member_f7042c2c2a")}>
      <div className="flex gap-2">
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          maxLength={64}
          placeholder={uiText("ui.username_93100fc44c")}
          aria-label={uiText("ui.username_to_invite_fa610e61a6")}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={busy || !username.trim()}>{busy ? uiText("ui.inviting_a4c2059a11") : uiText("ui.invite_1fd9ae1607")}</Button>
      </div>
      {notice ? <p role={notice.tone === "error" ? "alert" : "status"} className={`text-xs ${notice.tone === "error" ? "text-destructive" : "text-on-surface-variant"}`}>{notice.text}</p> : null}
    </form>
  );
}
