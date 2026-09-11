"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { GroupModerationAction } from "@/features/social/group-tools";

// Owner/moderator actions (plan 13.4 / 13.7). Every call goes to the group
// moderation endpoint; the server decides what this member may do.
async function moderate(slug: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/community/groups/${encodeURIComponent(slug)}/moderation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "The change could not be applied.");
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
  const router = useRouter();
  const [busy, setBusy] = useState<GroupModerationAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: GroupModerationAction) {
    let reason: string | undefined;
    if (action === "remove_post") {
      const answer = window.prompt("Remove this post from the group? Optional reason shown to the author:");
      if (answer === null) return;
      reason = answer.trim() || undefined;
    }
    setBusy(action);
    setError(null);
    try {
      await moderate(slug, { action, postId, reason });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change could not be applied.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {!removed ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(pinned ? "unpin" : "pin")}>
          {busy === "pin" || busy === "unpin" ? "Saving…" : pinned ? "Unpin" : "Pin"}
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
        {busy === "remove_post" || busy === "restore_post" ? "Saving…" : removed ? "Restore to group" : "Remove from group"}
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
}: {
  slug: string;
  profileId: string;
  role: "owner" | "admin" | "moderator" | "member";
  viewerRole: "owner" | "admin" | "moderator";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<GroupModerationAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (role === "owner") return null;
  if (viewerRole === "moderator" && role !== "member") return null;
  if (viewerRole === "admin" && role === "admin") return null;
  const canAssignRoles = viewerRole === "owner" || viewerRole === "admin";

  async function run(action: GroupModerationAction, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    setError(null);
    try {
      await moderate(slug, { action, profileId });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The change could not be applied.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {canAssignRoles ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(role === "member" ? "make_moderator" : "make_member")}>
          {role === "member" ? "Make moderator" : "Make member"}
        </Button>
      ) : null}
      {viewerRole === "owner" && role !== "admin" ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("make_admin", "Make this member an admin? Admins manage members, moderators, posts, and ordinary settings.")}>
          Make admin
        </Button>
      ) : null}
      <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("remove_member", "Remove this member from the group? They can rejoin later.")}>
        Remove
      </Button>
      {canAssignRoles ? (
        <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => run("ban_member", "Ban this member? They will not be able to rejoin until unbanned.")}>
          Ban
        </Button>
      ) : null}
      {viewerRole === "owner" ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("transfer_ownership", "Transfer ownership of this group to this member? You will become a moderator.")}>
          Make owner
        </Button>
      ) : null}
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

export function GroupArchiveButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    const reason = window.prompt("Archive this group? Posts are preserved but nobody can post or comment. Optional reason:");
    if (reason === null) return;
    setBusy(true);
    setError(null);
    try {
      await moderate(slug, { action: "archive", reason: reason.trim() || undefined });
      router.push("/community/groups");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The group could not be archived.");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={busy} onClick={archive}>
        {busy ? "Archiving…" : "Archive group"}
      </Button>
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

// Approve / decline one pending join request (plan 13.3).
export function GroupJoinRequestControls({ slug, profileId }: { slug: string; profileId: string }) {
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
      setError(caught instanceof Error ? caught.message : "The change could not be applied.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <Button type="button" size="sm" disabled={busy !== null} onClick={() => run("approve_request")}>
          {busy === "approve_request" ? "Approving…" : "Approve"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("decline_request")}>
          {busy === "decline_request" ? "Declining…" : "Decline"}
        </Button>
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

// Invite a member by username (plan 13.3). The server resolves the username
// and applies the blocked / unavailable and daily-limit rules.
export function GroupInviteForm({ slug }: { slug: string }) {
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
      if (!response.ok) throw new Error(payload?.error ?? "The invitation could not be sent.");
      const status = payload?.data?.status;
      setNotice({
        tone: "ok",
        text: status === "active"
          ? `@${handle} is now a member.`
          : payload?.data?.changed === false ? `@${handle} already has an invitation.` : `Invitation sent to @${handle}.`,
      });
      setUsername("");
      router.refresh();
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "The invitation could not be sent." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2" aria-label="Invite a member">
      <div className="flex gap-2">
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          maxLength={64}
          placeholder="@username"
          aria-label="Username to invite"
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={busy || !username.trim()}>{busy ? "Inviting…" : "Invite"}</Button>
      </div>
      {notice ? <p role={notice.tone === "error" ? "alert" : "status"} className={`text-xs ${notice.tone === "error" ? "text-destructive" : "text-on-surface-variant"}`}>{notice.text}</p> : null}
    </form>
  );
}
