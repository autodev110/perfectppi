"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

const RECENT_KEY = "perfectppi.recentSearches";
const RECENT_MAX = 8;

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function writeRecent(entries: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(entries.slice(0, RECENT_MAX)));
  } catch {
    // Private mode or blocked storage: recents are a convenience only.
  }
}

/** Remember a query on this device only (plan 27.2: recents are local and clearable). */
export function rememberSearch(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return;
  writeRecent([trimmed, ...readRecent().filter((entry) => entry.toLowerCase() !== trimmed.toLowerCase())]);
}

export function SearchBox({ initialQuery = "", tab = "posts", autoFocus = false }: { initialQuery?: string; tab?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => setRecent(readRecent()), []);

  function go(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    rememberSearch(trimmed);
    setRecent(readRecent());
    router.push(`/community/search?${new URLSearchParams({ q: trimmed, tab })}`);
  }

  return (
    <div className="space-y-3">
      <form role="search" className="flex gap-2" onSubmit={(event) => { event.preventDefault(); go(query); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search posts, people, groups, cars, listings, technicians"
            aria-label="Search the Community"
            maxLength={100}
            autoFocus={autoFocus}
            className="h-11 pl-10"
          />
        </div>
        <Button type="submit" className="h-11">Search</Button>
      </form>
      {recent.length > 0 && !initialQuery ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-on-surface-variant">Recent:</span>
          {recent.map((entry) => (
            <button key={entry} type="button" onClick={() => go(entry)} className="rounded-full bg-surface-container px-3 py-1 font-semibold text-on-surface hover:bg-surface-container-high">{entry}</button>
          ))}
          <button type="button" onClick={() => { writeRecent([]); setRecent([]); }} className="inline-flex items-center gap-1 text-on-surface-variant hover:text-on-surface" aria-label="Clear recent searches"><X className="h-3 w-3" />Clear</button>
        </div>
      ) : null}
    </div>
  );
}
