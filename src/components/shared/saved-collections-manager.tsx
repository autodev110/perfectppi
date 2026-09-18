"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Folder, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SavedCollectionItem, SavedCollectionSummary } from "@/features/saved/collections";

import { useTranslator } from "@/lib/i18n/client";

export function SavedCollectionsManager({ initialCollections }: { initialCollections: SavedCollectionSummary[] }) {
  const uiText = useTranslator();
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
        if (!response.ok) throw new Error(payload.error ?? uiText("ui.could_not_load_collection_2eb8b272a1"));
        if (active) setItems(payload.data);
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : uiText("ui.could_not_load_collection_2eb8b272a1")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedId, uiText]);

  async function createCollection() {
    if (!name.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/saved/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? uiText("ui.could_not_create_collection_6539d1c123"));
      const created = { ...payload.data, item_count: 0 } as SavedCollectionSummary;
      setCollections((current) => [created, ...current]);
      setSelectedId(created.id); setName("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : uiText("ui.could_not_create_collection_6539d1c123")); }
    finally { setBusy(false); }
  }

  async function renameCollection() {
    if (!selected) return;
    const nextName = window.prompt(uiText("ui.collection_name_922214922b"), selected.name)?.trim();
    if (!nextName || nextName === selected.name) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/saved/collections/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nextName }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? uiText("ui.could_not_rename_collection_2049ddb26b"));
      setCollections((current) => current.map((item) => item.id === selected.id ? { ...item, name: payload.data.name, updated_at: payload.data.updated_at } : item));
    } catch (caught) { setError(caught instanceof Error ? caught.message : uiText("ui.could_not_rename_collection_2049ddb26b")); }
    finally { setBusy(false); }
  }

  async function deleteCollection() {
    if (!selected || !window.confirm(uiText("ui.delete_your_original_bookmarks_will_stay_in__01508097c1", { arg0: String(selected.name) }))) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/saved/collections/${selected.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? uiText("ui.could_not_delete_collection_d68561249d"));
      const remaining = collections.filter((item) => item.id !== selected.id);
      setCollections(remaining); setSelectedId(remaining[0]?.id ?? null); setItems([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : uiText("ui.could_not_delete_collection_d68561249d")); }
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
        throw new Error(payload.error ?? uiText("ui.could_not_remove_item_b3eebe4072"));
      }
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setCollections((current) => current.map((collection) => collection.id === selected.id ? { ...collection, item_count: Math.max(0, collection.item_count - 1) } : collection));
    } catch (caught) { setError(caught instanceof Error ? caught.message : uiText("ui.could_not_remove_item_b3eebe4072")); }
    finally { setBusy(false); }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="space-y-3 rounded-3xl bg-surface-container-low p-4 ghost-border">
        <div className="flex gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createCollection(); }} maxLength={60} placeholder={uiText("ui.new_collection_cefd66fedb")} />
          <Button size="icon" onClick={() => void createCollection()} disabled={busy || !name.trim()} aria-label={uiText("ui.create_collection_69152bd359")}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-1">
          {collections.map((collection) => (
            <button key={collection.id} type="button" onClick={() => setSelectedId(collection.id)} className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left ${selectedId === collection.id ? "bg-surface-container-lowest shadow-sm" : "hover:bg-surface-container"}`}>
              <span className="min-w-0"><span className="block truncate text-sm font-bold">{collection.name}</span><span className="text-xs text-muted-foreground">{collection.item_count}{uiText("ui.item_a5f3c2e9f9")}{collection.item_count === 1 ? "" : uiText("ui.s_043a718774")}</span></span>
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
          {collections.length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted-foreground">{uiText("ui.create_a_collection_to_organize_posts_listin_1791ac3e2a")}</p> : null}
        </div>
      </aside>
      <section className="min-w-0 rounded-3xl bg-surface-container-lowest p-5 ghost-border">
        {selected ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-heading text-xl font-extrabold">{selected.name}</h2><p className="text-xs text-muted-foreground">{uiText("ui.private_to_you_c2dbbd29e4")}</p></div>
              <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => void renameCollection()} disabled={busy}><Pencil className="h-4 w-4" />{uiText("ui.rename_3064d79a29")}</Button><Button variant="outline" size="sm" onClick={() => void deleteCollection()} disabled={busy} className="text-destructive"><Trash2 className="h-4 w-4" />{uiText("ui.delete_e2d0a54968")}</Button></div>
            </div>
            {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : null}
            {!loading && items.length === 0 ? <p className="rounded-2xl bg-surface-container-low p-8 text-center text-sm text-muted-foreground">{uiText("ui.use_the_collection_button_on_a_post_listing__a97da81913")}</p> : null}
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-outline-variant/30 p-4">
                  {item.href ? <Link href={item.href} className="min-w-0"><span className="block truncate text-sm font-bold">{item.title}</span>{item.subtitle ? <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span> : null}</Link> : <div className="min-w-0"><span className="block text-sm font-bold text-muted-foreground">{item.title}</span><span className="block text-xs text-muted-foreground">{item.subtitle}</span></div>}
                  <Button variant="ghost" size="icon" onClick={() => void removeItem(item)} disabled={busy} aria-label={uiText("ui.remove_from_collection_4c216ce12a")}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          </>
        ) : <div className="py-16 text-center"><Folder className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" /><p className="font-bold">{uiText("ui.no_collection_selected_143422842d")}</p></div>}
        {error ? <p className="mt-4 text-sm text-destructive" role="alert">{error}</p> : null}
      </section>
    </div>
  );
}
