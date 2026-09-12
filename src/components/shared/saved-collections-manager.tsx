"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Folder, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SavedCollectionItem, SavedCollectionSummary } from "@/features/saved/collections";

export function SavedCollectionsManager({ initialCollections }: { initialCollections: SavedCollectionSummary[] }) {
  const [collections, setCollections] = useState(initialCollections);
  const [selectedId, setSelectedId] = useState(initialCollections[0]?.id ?? null);
  const [items, setItems] = useState<SavedCollectionItem[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = collections.find((collection) => collection.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) { setItems([]); return; }
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/saved/collections/${selectedId}/items`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load collection");
        if (active) setItems(payload.data);
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Could not load collection"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  async function createCollection() {
    if (!name.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/saved/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not create collection");
      const created = { ...payload.data, item_count: 0 } as SavedCollectionSummary;
      setCollections((current) => [created, ...current]);
      setSelectedId(created.id); setName("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create collection"); }
    finally { setBusy(false); }
  }

  async function renameCollection() {
    if (!selected) return;
    const nextName = window.prompt("Collection name", selected.name)?.trim();
    if (!nextName || nextName === selected.name) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/saved/collections/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nextName }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not rename collection");
      setCollections((current) => current.map((item) => item.id === selected.id ? { ...item, name: payload.data.name, updated_at: payload.data.updated_at } : item));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not rename collection"); }
    finally { setBusy(false); }
  }

  async function deleteCollection() {
    if (!selected || !window.confirm(`Delete “${selected.name}”? Your original bookmarks will stay in All Saved.`)) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/saved/collections/${selected.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not delete collection");
      const remaining = collections.filter((item) => item.id !== selected.id);
      setCollections(remaining); setSelectedId(remaining[0]?.id ?? null); setItems([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete collection"); }
    finally { setBusy(false); }
  }

  async function removeItem(item: SavedCollectionItem) {
    if (!selected) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/saved/collections/${selected.id}/items`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "Could not remove item");
      }
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setCollections((current) => current.map((collection) => collection.id === selected.id ? { ...collection, item_count: Math.max(0, collection.item_count - 1) } : collection));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not remove item"); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="space-y-3 rounded-3xl bg-surface-container-low p-4 ghost-border">
        <div className="flex gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createCollection(); }} maxLength={60} placeholder="New collection" />
          <Button size="icon" onClick={() => void createCollection()} disabled={busy || !name.trim()} aria-label="Create collection"><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-1">
          {collections.map((collection) => (
            <button key={collection.id} type="button" onClick={() => setSelectedId(collection.id)} className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left ${selectedId === collection.id ? "bg-surface-container-lowest shadow-sm" : "hover:bg-surface-container"}`}>
              <span className="min-w-0"><span className="block truncate text-sm font-bold">{collection.name}</span><span className="text-xs text-muted-foreground">{collection.item_count} item{collection.item_count === 1 ? "" : "s"}</span></span>
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
          {collections.length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted-foreground">Create a collection to organize posts, listings, vehicles, and builds.</p> : null}
        </div>
      </aside>
      <section className="min-w-0 rounded-3xl bg-surface-container-lowest p-5 ghost-border">
        {selected ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-heading text-xl font-extrabold">{selected.name}</h2><p className="text-xs text-muted-foreground">Private to you</p></div>
              <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void renameCollection()} disabled={busy}><Pencil className="h-4 w-4" />Rename</Button><Button variant="outline" size="sm" onClick={() => void deleteCollection()} disabled={busy} className="text-destructive"><Trash2 className="h-4 w-4" />Delete</Button></div>
            </div>
            {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : null}
            {!loading && items.length === 0 ? <p className="rounded-2xl bg-surface-container-low p-8 text-center text-sm text-muted-foreground">Use the Collection button on a post, listing, vehicle, or shared build entry to add it here.</p> : null}
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-outline-variant/30 p-4">
                  {item.href ? <Link href={item.href} className="min-w-0"><span className="block truncate text-sm font-bold">{item.title}</span>{item.subtitle ? <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span> : null}</Link> : <div className="min-w-0"><span className="block text-sm font-bold text-muted-foreground">{item.title}</span><span className="block text-xs text-muted-foreground">{item.subtitle}</span></div>}
                  <Button variant="ghost" size="icon" onClick={() => void removeItem(item)} disabled={busy} aria-label="Remove from collection"><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </>
        ) : <div className="py-16 text-center"><Folder className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" /><p className="font-bold">No collection selected</p></div>}
        {error ? <p className="mt-4 text-sm text-destructive" role="alert">{error}</p> : null}
      </section>
    </div>
  );
}
