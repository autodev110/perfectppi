"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { t as uiText } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(payload?.error ?? uiText("ui.the_change_could_not_be_saved_c1ae9753ec"));
}

export function GroupRulesAcknowledgement({ slug }: { slug: string }) {
  const uiText = useTranslator();
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
      setError(caught instanceof Error ? caught.message : uiText("ui.the_rules_could_not_be_accepted_96d7eb0045"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col items-start gap-2 border-t border-outline-variant/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold">{uiText("ui.accept_the_latest_rules_to_post_in_this_grou_3c8057148b")}</p>
      <Button type="button" size="sm" onClick={accept} disabled={busy}>{busy ? uiText("ui.accepting_a168fd64e9") : uiText("ui.i_agree_to_the_rules_46a9d8deff")}</Button>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

const SLOW_MODE_OPTIONS = [
  [0, uiText("ui.off_ca7981b46e")], [30, uiText("ui.30_seconds_f3d19541f3")], [60, uiText("ui.1_minute_e67b6f61f5")], [300, uiText("ui.5_minutes_3170543ce4")],
  [900, uiText("ui.15_minutes_2f18bc2a00")], [3600, uiText("ui.1_hour_f8b8883f0c")], [21600, uiText("ui.6_hours_4105ae3b8a")], [86400, uiText("ui.24_hours_f0514e8df8")],
] as const;

export function GroupSlowModeControl({ slug, initialSeconds }: { slug: string; initialSeconds: number }) {
  const uiText = useTranslator();
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
      setNotice(uiText("ui.slow_mode_updated_47224cdaaa"));
      router.refresh();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : uiText("ui.slow_mode_could_not_be_updated_8661ce03cf"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="group-slow-mode">{uiText("ui.slow_mode_1efc091c01")}</Label>
      <div className="flex gap-2">
        <select id="group-slow-mode" value={seconds} onChange={(event) => setSeconds(Number(event.target.value))} className="h-10 flex-1 rounded-md border border-input bg-transparent px-3 text-sm">
          {SLOW_MODE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}{uiText("ui.between_posts_586c30a785")}</option>)}
        </select>
        <Button type="button" variant="outline" onClick={save} disabled={busy || seconds === initialSeconds}>{busy ? uiText("ui.saving_23e39291d6") : uiText("ui.save_1509f561f2")}</Button>
      </div>
      <p className="text-xs text-on-surface-variant">{uiText("ui.applies_separately_to_each_member_existing_p_8eedade99c")}</p>
      {notice ? <p role="status" className="text-xs text-on-surface-variant">{notice}</p> : null}
    </div>
  );
}

export function GroupFaqForm({ slug }: { slug: string }) {
  const uiText = useTranslator();
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
      setError(caught instanceof Error ? caught.message : uiText("ui.the_faq_resource_could_not_be_added_90f3424d28"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-surface-container-lowest p-5 shadow-sm ghost-border">
      <h2 className="font-heading text-lg font-extrabold">{uiText("ui.add_an_faq_resource_3f32fa4b64")}</h2>
      <div className="space-y-1.5"><Label htmlFor="faq-question">{uiText("ui.question_289aff12b0")}</Label><Input id="faq-question" required minLength={3} maxLength={200} value={question} onChange={(event) => setQuestion(event.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="faq-answer">{uiText("ui.answer_b2a3aa6027")}</Label><Textarea id="faq-answer" required minLength={3} maxLength={2000} rows={4} value={answer} onChange={(event) => setAnswer(event.target.value)} /></div>
      <Button type="submit" disabled={busy}>{busy ? uiText("ui.adding_c6de6f45c8") : uiText("ui.add_resource_03cf099b19")}</Button>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

export function GroupFaqDeleteButton({ slug, entryId }: { slug: string; entryId: string }) {
  const uiText = useTranslator();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(uiText("ui.remove_this_resource_from_the_group_faq_8b5f84c09d"))) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/community/groups/${encodeURIComponent(slug)}/faq?entry=${encodeURIComponent(entryId)}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText("ui.the_faq_resource_could_not_be_removed_cda617a1fb"));
      setBusy(false);
    }
  }

  return <div><Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove} disabled={busy}>{busy ? uiText("ui.removing_d4b09919ec") : uiText("ui.remove_c3812fc4ac")}</Button>{error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}</div>;
}

export function SaveAcceptedAnswerToFaqButton({ slug, postId }: { slug: string; postId: string }) {
  const uiText = useTranslator();
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
      setNotice(uiText("ui.added_to_faq_e009567554"));
      router.refresh();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : uiText("ui.the_answer_could_not_be_added_e792e78722"));
    } finally {
      setBusy(false);
    }
  }

  return <span className="inline-flex items-center gap-2"><Button type="button" size="sm" variant="outline" onClick={save} disabled={busy}>{busy ? uiText("ui.adding_c6de6f45c8") : uiText("ui.add_accepted_answer_to_faq_a519fe0e73")}</Button>{notice ? <span role="status" className="text-xs text-on-surface-variant">{notice}</span> : null}</span>;
}
