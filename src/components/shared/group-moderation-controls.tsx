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

export function GroupMemberModerationMenu({
  slug,
  profileId,
  role,
  viewerRole,
}: {
  slug: string;
  profileId: string;
  role: "owner" | "moderator" | "member";
  viewerRole: "owner" | "moderator";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<GroupModerationAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (role === "owner") return null;
  if (viewerRole === "moderator" && role === "moderator") return null;

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
      {viewerRole === "owner" ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run(role === "moderator" ? "make_member" : "make_moderator")}>
          {role === "moderator" ? "Make member" : "Make moderator"}
        </Button>
      ) : null}
      <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("remove_member", "Remove this member from the group? They can rejoin later.")}>
        Remove
      </Button>
      {viewerRole === "owner" ? (
        <>
          <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => run("ban_member", "Ban this member? They will not be able to rejoin until unbanned.")}>
            Ban
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy !== null} onClick={() => run("transfer_ownership", "Transfer ownership of this group to this member? You will become a moderator.")}>
            Make owner
          </Button>
        </>
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
