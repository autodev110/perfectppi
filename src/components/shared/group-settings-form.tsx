"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GROUP_CATEGORIES, GROUP_CATEGORY_LABELS } from "@/lib/social/group-options";

export type GroupSettingsValues = {
  slug?: string;
  name: string;
  description: string;
  category: string;
  rules: string[];
  vehicleMake: string;
  vehicleModel: string;
  yearStart: number | null;
  yearEnd: number | null;
  locationRegion: string;
  postingPolicy: "members" | "moderators";
};

// Create (mode "create", slug editable) or edit (mode "edit", slug fixed) a
// member group (plan 13.2). Visibility and join policy are fixed to Public /
// Open in this release; the form says so instead of hiding it.
export function GroupSettingsForm({
  mode,
  initial,
  slugForUpdate,
}: {
  mode: "create" | "edit";
  initial: GroupSettingsValues;
  slugForUpdate?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [rulesText, setRulesText] = useState(initial.rules.join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof GroupSettingsValues>(key: K, value: GroupSettingsValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const body = {
      ...values,
      rules: rulesText.split("\n").map((rule) => rule.trim()).filter(Boolean),
      yearStart: values.yearStart || null,
      yearEnd: values.yearEnd || null,
    };
    try {
      const response = await fetch(
        mode === "create" ? "/api/community/groups" : `/api/community/groups/${encodeURIComponent(slugForUpdate ?? "")}`,
        { method: mode === "create" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      const payload = (await response.json().catch(() => null)) as { data?: { slug: string }; error?: string } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error ?? "The group could not be saved.");
      router.push(`/community/groups/${payload.data.slug}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The group could not be saved.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="group-name">Group name</Label>
          <Input id="group-name" required minLength={2} maxLength={80} value={values.name} onChange={(e) => update("name", e.target.value)} />
        </div>
        {mode === "create" ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="group-slug">Group address</Label>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>/community/groups/</span>
              <Input
                id="group-slug"
                required
                minLength={3}
                maxLength={64}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={values.slug ?? ""}
                onChange={(e) => update("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="miata-meetups"
                aria-describedby="group-slug-help"
              />
            </div>
            <p id="group-slug-help" className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens. This cannot be changed later.</p>
          </div>
        ) : null}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="group-description">Description</Label>
          <Textarea id="group-description" required maxLength={500} rows={3} value={values.description} onChange={(e) => update("description", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-category">Category</Label>
          <select id="group-category" value={values.category} onChange={(e) => update("category", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm">
            {GROUP_CATEGORIES.map((category) => <option key={category} value={category}>{GROUP_CATEGORY_LABELS[category]}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-posting">Who can post</Label>
          <select id="group-posting" value={values.postingPolicy} onChange={(e) => update("postingPolicy", e.target.value as "members" | "moderators")} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm">
            <option value="members">All members</option>
            <option value="moderators">Moderators only (announcements)</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-make">Make (optional)</Label>
          <Input id="group-make" maxLength={64} value={values.vehicleMake} onChange={(e) => update("vehicleMake", e.target.value)} placeholder="Mazda" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-model">Model (optional)</Label>
          <Input id="group-model" maxLength={64} value={values.vehicleModel} onChange={(e) => update("vehicleModel", e.target.value)} placeholder="MX-5" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-year-start">From year (optional)</Label>
          <Input id="group-year-start" type="number" min={1886} max={2100} value={values.yearStart ?? ""} onChange={(e) => update("yearStart", e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-year-end">To year (optional)</Label>
          <Input id="group-year-end" type="number" min={1886} max={2100} value={values.yearEnd ?? ""} onChange={(e) => update("yearEnd", e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="group-region">General area (optional)</Label>
          <Input id="group-region" maxLength={80} value={values.locationRegion} onChange={(e) => update("locationRegion", e.target.value)} placeholder="Portland, OR" aria-describedby="group-region-help" />
          <p id="group-region-help" className="text-xs text-muted-foreground">City or region only — never a street address.</p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="group-rules">Rules (one per line, up to 12)</Label>
          <Textarea id="group-rules" rows={4} maxLength={2400} value={rulesText} onChange={(e) => setRulesText(e.target.value)} placeholder={"Be factual\nNo sales spam"} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Groups are Public and Open to join in this release: any signed-in member can see and join them. Private and invite-only groups come later.
      </p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : mode === "create" ? "Create group" : "Save settings"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
