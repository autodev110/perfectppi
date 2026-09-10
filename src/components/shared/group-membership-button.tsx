"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function GroupMembershipButton({
  groupId,
  initialJoined,
  owner = false,
}: {
  groupId: string;
  initialJoined: boolean;
  owner?: boolean;
}) {
  const router = useRouter();
  const [joined, setJoined] = useState(initialJoined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/community/groups/${groupId}/membership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joined: !joined }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not update membership");
      setJoined(payload.data.joined);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update membership");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant={joined ? "outline" : "default"} onClick={update} disabled={loading || owner}>
        {owner ? "Group owner" : loading ? "Updating..." : joined ? "Leave group" : "Join group"}
      </Button>
      {error ? <p className="max-w-xs text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
