"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Person = {
  id: string;
  display_name: string | null;
  username: string | null;
};

type Relationships = { blocked: Person[]; muted: Person[] };

export function SafetyRelationships() {
  const [relationships, setRelationships] = useState<Relationships>({ blocked: [], muted: [] });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/social/relationships", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setRelationships(payload.data);
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

  if (relationships.blocked.length === 0 && relationships.muted.length === 0) {
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
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
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
