"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? "The change could not be saved.");
}

export function GroupRulesAcknowledgement({ slug }: { slug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/community/groups/${encodeURIComponent(slug)}/rules`, { method: "POST" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The rules could not be accepted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col items-start gap-2 border-t border-outline-variant/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold">Accept the latest rules to post in this group.</p>
      <Button type="button" size="sm" onClick={accept} disabled={busy}>{busy ? "Accepting…" : "I agree to the rules"}</Button>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

const SLOW_MODE_OPTIONS = [
  [0, "Off"], [30, "30 seconds"], [60, "1 minute"], [300, "5 minutes"],
  [900, "15 minutes"], [3600, "1 hour"], [21600, "6 hours"], [86400, "24 hours"],
] as const;

export function GroupSlowModeControl({ slug, initialSeconds }: { slug: string; initialSeconds: number }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(initialSeconds);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      await requestJson(`/api/community/groups/${encodeURIComponent(slug)}/moderation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_slow_mode", seconds }),
      });
      setNotice("Slow mode updated.");
      router.refresh();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Slow mode could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="group-slow-mode">Slow mode</Label>
      <div className="flex gap-2">
        <select id="group-slow-mode" value={seconds} onChange={(event) => setSeconds(Number(event.target.value))} className="h-10 flex-1 rounded-md border border-input bg-transparent px-3 text-sm">
          {SLOW_MODE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label} between posts</option>)}
        </select>
        <Button type="button" variant="outline" onClick={save} disabled={busy || seconds === initialSeconds}>{busy ? "Saving…" : "Save"}</Button>
      </div>
      <p className="text-xs text-on-surface-variant">Applies separately to each member. Existing posts are not affected.</p>
      {notice ? <p role="status" className="text-xs text-on-surface-variant">{notice}</p> : null}
    </div>
  );
}

export function GroupFaqForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/community/groups/${encodeURIComponent(slug)}/faq`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
      });
      setQuestion("");
      setAnswer("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The FAQ resource could not be added.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-surface-container-lowest p-5 shadow-sm ghost-border">
      <h2 className="font-heading text-lg font-extrabold">Add an FAQ resource</h2>
      <div className="space-y-1.5"><Label htmlFor="faq-question">Question</Label><Input id="faq-question" required minLength={3} maxLength={200} value={question} onChange={(event) => setQuestion(event.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="faq-answer">Answer</Label><Textarea id="faq-answer" required minLength={3} maxLength={2000} rows={4} value={answer} onChange={(event) => setAnswer(event.target.value)} /></div>
      <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add resource"}</Button>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

export function GroupFaqDeleteButton({ slug, entryId }: { slug: string; entryId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm("Remove this resource from the group FAQ?")) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/community/groups/${encodeURIComponent(slug)}/faq?entry=${encodeURIComponent(entryId)}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The FAQ resource could not be removed.");
      setBusy(false);
    }
  }

  return <div><Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove} disabled={busy}>{busy ? "Removing…" : "Remove"}</Button>{error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}</div>;
}

export function SaveAcceptedAnswerToFaqButton({ slug, postId }: { slug: string; postId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      await requestJson(`/api/community/groups/${encodeURIComponent(slug)}/faq`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePostId: postId }),
      });
      setNotice("Added to FAQ");
      router.refresh();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "The answer could not be added.");
    } finally {
      setBusy(false);
    }
  }

  return <span className="inline-flex items-center gap-2"><Button type="button" size="sm" variant="outline" onClick={save} disabled={busy}>{busy ? "Adding…" : "Add accepted answer to FAQ"}</Button>{notice ? <span role="status" className="text-xs text-on-surface-variant">{notice}</span> : null}</span>;
}
