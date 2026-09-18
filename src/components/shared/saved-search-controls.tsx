"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeFilters, hasActiveFilters, type MarketplaceFilters } from "@/lib/marketplace/filters";
import { BookmarkPlus, Trash2 } from "lucide-react";

import { useTranslator } from "@/lib/i18n/client";

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
  const uiText = useTranslator();
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
      if (!response.ok || !payload?.data) throw new Error(payload?.error ?? uiText("ui.the_search_could_not_be_saved_1ee5c0adcd"));
      setNaming(false);
      setName("");
      router.push(`/marketplace?saved=${payload.data.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText("ui.the_search_could_not_be_saved_1ee5c0adcd"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy || !window.confirm(uiText("ui.remove_this_saved_search_efaac36712"))) return;
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
          <span className="font-bold text-on-surface-variant">{uiText("ui.saved_searches_077a804a6b")}</span>
          {searches.map((search) => (
            <span key={search.id} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ghost-border ${activeId === search.id ? "bg-primary text-primary-foreground" : "bg-surface-container-lowest text-on-surface"}`}>
              <Link href={`/marketplace?saved=${search.id}`} title={describeFilters(search.filters)}>{search.name}</Link>
              <button type="button" onClick={() => remove(search.id)} aria-label={uiText("ui.remove_saved_search_3ac165642d", { arg0: String(search.name) })} className="opacity-70 hover:opacity-100"><Trash2 className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      ) : null}
      {canSave && !activeId ? (
        naming ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder={describeFilters(current)} aria-label={uiText("ui.saved_search_name_d1415f74e4")} className="h-9 w-64 text-sm" />
            <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} className="rounded" />{uiText("ui.notify_me_daily_about_new_matches_0a59147e68")}</label>
            <Button type="submit" size="sm" disabled={busy}>{busy ? uiText("ui.saving_23e39291d6") : uiText("ui.save_1509f561f2")}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(false)} disabled={busy}>{uiText("ui.cancel_19766ed6cc")}</Button>
          </form>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setNaming(true)}>
            <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" />{uiText("ui.save_this_search_cd3b55bc11")}</Button>
        )
      ) : null}
      {activeId ? <p className="text-xs text-on-surface-variant">{uiText("ui.showing_a_saved_search_its_filters_are_in_th_73da7b6b1e")}</p> : null}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      {canSave ? <p className="text-xs text-on-surface-variant">{uiText("ui.current_filters_893fb78671")}{describeFilters(current)}</p> : null}
    </div>
  );
}
