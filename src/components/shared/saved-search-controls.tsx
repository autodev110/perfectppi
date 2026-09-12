"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeFilters, hasActiveFilters, type MarketplaceFilters } from "@/lib/marketplace/filters";
import { BookmarkPlus, Trash2 } from "lucide-react";

type SavedSearch = { id: string; name: string; filters: MarketplaceFilters; notify: boolean };

// Saved searches (plan 25.1): chips to re-run, save the current filters with
// a name, delete. Ten per member; one notice per search per day when new
// listings match.
export function SavedSearchControls({
  searches,
  current,
  activeId,
}: {
  searches: SavedSearch[];
  current: MarketplaceFilters;
  activeId: string | null;
}) {
  const router = useRouter();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSave = hasActiveFilters(current);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/marketplace/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || describeFilters(current), filters: current, notify }),
      });
      const payload = (await response.json().catch(() => null)) as { data?: { id: string }; error?: string } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error ?? "The search could not be saved.");
      setNaming(false);
      setName("");
      router.push(`/marketplace?saved=${payload.data.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The search could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy || !window.confirm("Remove this saved search?")) return;
    setBusy(true);
    try {
      await fetch(`/api/marketplace/saved-searches/${id}`, { method: "DELETE" });
      if (activeId === id) router.push("/marketplace");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {searches.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-on-surface-variant">Saved searches:</span>
          {searches.map((search) => (
            <span key={search.id} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ghost-border ${activeId === search.id ? "bg-primary text-primary-foreground" : "bg-surface-container-lowest text-on-surface"}`}>
              <Link href={`/marketplace?saved=${search.id}`} title={describeFilters(search.filters)}>{search.name}</Link>
              <button type="button" onClick={() => remove(search.id)} aria-label={`Remove saved search ${search.name}`} className="opacity-70 hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      ) : null}
      {canSave && !activeId ? (
        naming ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder={describeFilters(current)} aria-label="Saved search name" className="h-9 w-64 text-sm" />
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} className="rounded" />Notify me daily about new matches</label>
            <Button type="submit" size="sm" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(false)} disabled={busy}>Cancel</Button>
          </form>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setNaming(true)}>
            <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" />Save this search
          </Button>
        )
      ) : null}
      {activeId ? <p className="text-xs text-on-surface-variant">Showing a saved search. Its filters are in the form above; change them and save again to update.</p> : null}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      {canSave ? <p className="text-xs text-on-surface-variant">Current filters: {describeFilters(current)}</p> : null}
    </div>
  );
}
