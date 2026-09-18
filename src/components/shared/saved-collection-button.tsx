"use client";

import { useState } from "react";
import { FolderPlus, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { SavedCollectionEntityType, SavedCollectionSummary } from "@/features/saved/collections";

import { useTranslator } from "@/lib/i18n/client";

export function SavedCollectionButton({
  entityType,
  entityId,
  compact = false,
}: {
  entityType: SavedCollectionEntityType;
  entityId: string;
  compact?: boolean;
}) {
  const uiText = useTranslator();
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<SavedCollectionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function loadCollections() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/saved/collections", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? uiText("ui.could_not_load_collections_0757d76883"));
      setCollections(payload.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : uiText("ui.could_not_load_collections_0757d76883"));
    } finally {
      setLoading(false);
    }
  }

  async function addToCollection(collectionId: string) {
    setBusyId(collectionId);
    setMessage(null);
    try {
      const response = await fetch(`/api/saved/collections/${collectionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, saved: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? uiText("ui.could_not_add_this_item_1320ae3a10"));
      setMessage(uiText("ui.added_to_collection_5c9cabec2f"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : uiText("ui.could_not_add_this_item_1320ae3a10"));
    } finally {
      setBusyId(null);
    }
  }

  async function createCollection() {
    if (!newName.trim()) return;
    setBusyId("new");
    setMessage(null);
    try {
      const response = await fetch("/api/saved/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? uiText("ui.could_not_create_collection_6539d1c123"));
      const collection = { ...payload.data, item_count: 0 } as SavedCollectionSummary;
      setCollections((current) => [collection, ...current]);
      setNewName("");
      await addToCollection(collection.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : uiText("ui.could_not_create_collection_6539d1c123"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) void loadCollections(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size={compact ? "icon" : "sm"} aria-label={uiText("ui.add_to_a_collection_42ecbfb2c3")}>
          <FolderPlus className="h-4 w-4" />
          {compact ? null : uiText("ui.collection_7b790708ff")}
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{uiText("ui.save_to_a_collection_e88564561a")}</DialogTitle>
          <DialogDescription>{uiText("ui.collections_are_private_owners_and_other_mem_5c56f78f8f")}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void createCollection(); }}
            maxLength={60}
            placeholder={uiText("ui.new_collection_name_3b4aeb9c6e")}
            aria-label={uiText("ui.new_collection_name_3b4aeb9c6e")}
          />
          <Button onClick={() => void createCollection()} disabled={!newName.trim() || busyId !== null} aria-label={uiText("ui.create_collection_69152bd359")}>
            {busyId === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {loading ? <p className="py-6 text-center text-sm text-muted-foreground">{uiText("ui.loading_collections_bfabc4a516")}</p> : null}
          {!loading && collections.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">{uiText("ui.create_your_first_collection_above_10750e1e24")}</p> : null}
          {collections.map((collection) => (
            <button
              type="button"
              key={collection.id}
              onClick={() => void addToCollection(collection.id)}
              disabled={busyId !== null}
              className="flex w-full items-center justify-between rounded-2xl border border-outline-variant/30 px-4 py-3 text-left hover:bg-surface-container"
            >
              <span>
                <span className="block text-sm font-bold">{collection.name}</span>
                <span className="block text-xs text-muted-foreground">{collection.item_count}{uiText("ui.item_a5f3c2e9f9")}{collection.item_count === 1 ? "" : uiText("ui.s_043a718774")}</span>
              </span>
              {busyId === collection.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
            </button>
          ))}
        </div>
        {message ? <p className={`text-sm ${message === "Added to collection" ? "text-teal" : "text-destructive"}`} role="status">{message}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
