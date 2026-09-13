"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { POST_TYPE_LABELS, type PostType } from "@/lib/community/post-types";

type Person = {
  id: string;
  display_name: string | null;
  username: string | null;
};

type Relationships = { blocked: Person[]; muted: Person[] };
type FeedMute = {
  id: string;
  scope: "group" | "post_type" | "vehicle_topic";
  group_id: string | null;
  post_type: PostType | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  group: { name: string } | null;
};

export function SafetyRelationships() {
  const [relationships, setRelationships] = useState<Relationships>({ blocked: [], muted: [] });
  const [feedMutes, setFeedMutes] = useState<FeedMute[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const [relationshipResponse, feedResponse] = await Promise.all([
      fetch("/api/social/relationships", { cache: "no-store" }),
      fetch("/api/community/feed-mutes", { cache: "no-store" }),
    ]);
    if (relationshipResponse.ok) {
      const payload = await relationshipResponse.json();
      setRelationships(payload.data);
    }
    if (feedResponse.ok) {
      const payload = await feedResponse.json();
      setFeedMutes(payload.data);
    }
  }

  async function removeFeedMute(mute: FeedMute) {
    setBusyId(`feed:${mute.id}`);
    setError(null);
    const body = mute.scope === "group"
      ? { scope: "group", groupId: mute.group_id, muted: false }
      : mute.scope === "post_type"
        ? { scope: "post_type", postType: mute.post_type, muted: false }
        : { scope: "vehicle_topic", vehicleMake: mute.vehicle_make, vehicleModel: mute.vehicle_model, muted: false };
    const response = await fetch("/api/community/feed-mutes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) setError("This feed preference could not be changed. Please try again.");
    else await load();
    setBusyId(null);
  }

  useEffect(() => { void load(); }, []);

  async function remove(profileId: string, kind: "block" | "mute") {
    setBusyId(`${kind}:${profileId}`);
    setError(null);
    const response = await fetch("/api/social/relationships", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, kind, enabled: false }),
    });
    if (!response.ok) {
      setError("This privacy setting could not be changed. Please try again.");
    } else {
      await load();
    }
    setBusyId(null);
  }

  if (relationships.blocked.length === 0 && relationships.muted.length === 0 && feedMutes.length === 0) {
    return <p className="text-sm text-muted-foreground">You have not blocked or muted anyone.</p>;
  }

  return (
    <div className="space-y-5">
      {relationships.blocked.length > 0 ? (
        <RelationshipList title="Blocked accounts" people={relationships.blocked} action="Unblock" busyId={busyId} onRemove={(id) => remove(id, "block")} />
      ) : null}
      {relationships.muted.length > 0 ? (
        <RelationshipList title="Muted accounts" people={relationships.muted} action="Unmute" busyId={busyId} onRemove={(id) => remove(id, "mute")} />
      ) : null}
      {feedMutes.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Hidden from your Community feed</h3>
          <p className="text-xs text-muted-foreground">These preferences do not change memberships or friendships.</p>
          {feedMutes.map((mute) => (
            <div key={mute.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="min-w-0 truncate text-sm">{feedMuteLabel(mute)}</span>
              <Button type="button" size="sm" variant="outline" disabled={busyId === `feed:${mute.id}`} onClick={() => removeFeedMute(mute)}>Show again</Button>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function feedMuteLabel(mute: FeedMute) {
  if (mute.scope === "group") return mute.group?.name ?? "Unavailable group";
  if (mute.scope === "post_type" && mute.post_type) return `${POST_TYPE_LABELS[mute.post_type].label} posts`;
  const topic = [mute.vehicle_make, mute.vehicle_model].filter(Boolean).join(" ");
  return `${topic || "Vehicle topic"} posts`;
}

function RelationshipList({
  title,
  people,
  action,
  busyId,
  onRemove,
}: {
  title: string;
  people: Person[];
  action: string;
  busyId: string | null;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {people.map((person) => (
        <div key={person.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <span className="min-w-0 truncate text-sm">{person.display_name ?? (person.username ? `@${person.username}` : "PerfectPPI member")}</span>
          <Button type="button" size="sm" variant="outline" disabled={busyId?.endsWith(person.id)} onClick={() => onRemove(person.id)}>{action}</Button>
        </div>
      ))}
    </div>
  );
}
