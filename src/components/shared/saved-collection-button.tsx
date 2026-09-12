"use client";

import { useState } from "react";
import { FolderPlus, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { SavedCollectionEntityType, SavedCollectionSummary } from "@/features/saved/collections";

export function SavedCollectionButton({
  entityType,
  entityId,
  compact = false,
}: {
  entityType: SavedCollectionEntityType;
  entityId: string;
  compact?: boolean;
}) {
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
      if (!response.ok) throw new Error(payload.error ?? "Could not load collections");
      setCollections(payload.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load collections");
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
      if (!response.ok) throw new Error(payload.error ?? "Could not add this item");
      setMessage("Added to collection");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add this item");
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
      if (!response.ok) throw new Error(payload.error ?? "Could not create collection");
      const collection = { ...payload.data, item_count: 0 } as SavedCollectionSummary;
      setCollections((current) => [collection, ...current]);
      setNewName("");
      await addToCollection(collection.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create collection");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) void loadCollections(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size={compact ? "icon" : "sm"} aria-label="Add to a collection">
          <FolderPlus className="h-4 w-4" />
          {compact ? null : "Collection"}
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save to a collection</DialogTitle>
          <DialogDescription>Collections are private. Owners and other members cannot see them.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void createCollection(); }}
            maxLength={60}
            placeholder="New collection name"
            aria-label="New collection name"
          />
          <Button onClick={() => void createCollection()} disabled={!newName.trim() || busyId !== null} aria-label="Create collection">
            {busyId === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {loading ? <p className="py-6 text-center text-sm text-muted-foreground">Loading collections…</p> : null}
          {!loading && collections.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">Create your first collection above.</p> : null}
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
                <span className="block text-xs text-muted-foreground">{collection.item_count} item{collection.item_count === 1 ? "" : "s"}</span>
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
