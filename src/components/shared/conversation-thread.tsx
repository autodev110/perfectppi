"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markConversationRead, sendMessage } from "@/features/messages/actions";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatRelativeTime, getInitials } from "@/lib/utils/formatting";
import { ArrowLeft, Radio, SendHorizontal, CheckCheck, Check } from "lucide-react";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

type Participant = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "display_name" | "username" | "role"
>;

function participantName(participant: Participant | undefined) {
  if (!participant) return "Unknown";
  if (participant.display_name?.trim()) return participant.display_name;
  if (participant.username?.trim()) return `@${participant.username}`;
  return participant.id.slice(0, 8);
}

function avatarHue(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function formatDayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  const sameDay = d.toDateString() === now.toDateString();
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (sameDay) return "Today";
  if (isYesterday) return "Yesterday";

  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });

  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

function groupByDay(messages: MessageRow[]) {
  const groups: { label: string; key: string; messages: MessageRow[] }[] = [];
  for (const msg of messages) {
    const d = new Date(msg.created_at);
    const key = d.toDateString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.messages.push(msg);
    } else {
      groups.push({ key, label: formatDayLabel(msg.created_at), messages: [msg] });
    }
  }
  return groups;
}

export function ConversationThread({
  conversationId,
  routeBase,
  myProfileId,
  participants,
  messages: initialMessages,
  highlightMessageId,
}: {
  conversationId: string;
  routeBase: string;
  myProfileId: string;
  participants: Participant[];
  messages: MessageRow[];
  highlightMessageId?: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [liveConnected, setLiveConnected] = useState(false);
  const [flashedMessageId, setFlashedMessageId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hasScrolledToHighlight = useRef(false);

  const participantsById = useMemo(
    () => new Map(participants.map((p) => [p.id, p])),
    [participants],
  );

  const otherParticipants = useMemo(
    () => participants.filter((p) => p.id !== myProfileId),
    [participants, myProfileId],
  );

  const primaryOther = otherParticipants[0] ?? null;
  const primaryOtherLabel = primaryOther ? participantName(primaryOther) : "No participants";
  const primaryOtherInitials = getInitials(primaryOtherLabel || "?");
  const primaryOtherHue = primaryOther ? avatarHue(primaryOther.id) : 220;

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (data) {
      setMessages((prev) => {
        // Preserve optimistic temp messages still pending
        const temps = prev.filter((m) => m.id.startsWith("temp-"));
        return [...data, ...temps];
      });
    }
  }, [conversationId]);

  const markCurrentConversationRead = useCallback(async () => {
    const result = await markConversationRead(conversationId);
    if ("error" in result) return;
    await refetch();
    router.refresh();
  }, [conversationId, refetch, router]);

  // Realtime subscription — will fire only if the messages table is in supabase_realtime publication.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = payload.new as MessageRow;
          if (incoming.sender_id !== myProfileId) {
            void markCurrentConversationRead();
            return;
          }
          void refetch();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void refetch();
        },
      )
      .subscribe((status) => {
        setLiveConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, markCurrentConversationRead, myProfileId, refetch]);

  // If this thread is already open, incoming messages should not remain unread.
  useEffect(() => {
    const hasUnreadIncoming = messages.some(
      (message) => message.sender_id !== myProfileId && message.status === "unread",
    );
    if (hasUnreadIncoming) void markCurrentConversationRead();
  }, [markCurrentConversationRead, messages, myProfileId]);

  // Polling fallback — every 6s, refetch so new messages from the other party land even without realtime.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        refetch();
      }
    }, 6000);
    return () => window.clearInterval(id);
  }, [refetch]);

  // Refetch when the tab regains focus.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") refetch();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetch]);

  // Auto-scroll to bottom when messages change — unless we're about to scroll to a highlighted one.
  useEffect(() => {
    if (highlightMessageId && !hasScrolledToHighlight.current) return;
    const el = threadScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, highlightMessageId]);

  // Scroll to and flash the highlighted message once it's rendered.
  useEffect(() => {
    if (!highlightMessageId) return;
    if (hasScrolledToHighlight.current) return;
    const target = messageRefs.current.get(highlightMessageId);
    if (!target) return;

    hasScrolledToHighlight.current = true;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashedMessageId(highlightMessageId);
    const timer = window.setTimeout(() => setFlashedMessageId(null), 2200);
    return () => window.clearTimeout(timer);
  }, [highlightMessageId, messages]);

  function registerMessageRef(id: string) {
    return (node: HTMLDivElement | null) => {
      if (node) messageRefs.current.set(id, node);
      else messageRefs.current.delete(id);
    };
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const content = draft.trim();
    if (!content || isPending) return;

    setError(null);

    const tempId = `temp-${Date.now()}`;
    const optimistic: MessageRow = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: myProfileId,
      content,
      has_attachment: false,
      attachment_url: null,
      attachment_type: null,
      status: "unread",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    textareaRef.current?.focus();

    startTransition(async () => {
      const result = await sendMessage({
        conversationId,
        content,
      });

      if ("error" in result) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setDraft(content);
        setError(result.error ?? "Failed to send message");
        return;
      }

      const real = result.data as MessageRow;
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (withoutTemp.some((m) => m.id === real.id)) return withoutTemp;
        return [...withoutTemp, real];
      });

      // Let the sidebar / conversation list refresh last-message previews.
      router.refresh();
    });
  }

  const grouped = useMemo(() => groupByDay(messages), [messages]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={routeBase}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All messages
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/20 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          <Radio className={`h-3.5 w-3.5 ${liveConnected ? "text-emerald-600" : "text-amber-500 animate-pulse"}`} />
          {liveConnected ? "Live" : "Syncing"}
        </span>
      </div>

      <Card className="overflow-hidden border-outline-variant/20 shadow-sm">
        <div className="flex items-center gap-3 border-b border-outline-variant/10 bg-surface-container-low px-5 py-4">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
            style={{ backgroundColor: `hsl(${primaryOtherHue} 55% 45%)` }}
          >
            {primaryOtherInitials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-lg font-extrabold leading-tight truncate">
              {primaryOtherLabel}
            </h1>
            {otherParticipants.length > 1 ? (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                +{otherParticipants.length - 1} more participants
              </p>
            ) : primaryOther ? (
              <p className="mt-0.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                {primaryOther.role}
              </p>
            ) : null}
          </div>
        </div>

        <CardContent className="p-0">
          <div
            ref={threadScrollRef}
            className="h-[60vh] max-h-[640px] min-h-[420px] overflow-y-auto bg-gradient-to-b from-surface-container-lowest to-surface-container-low/40 px-4 py-5 sm:px-6"
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-container">
                  <SendHorizontal className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold text-foreground">No messages yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Send the first message to start the conversation.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {grouped.map((group) => (
                  <div key={group.key} className="space-y-2">
                    <div className="flex items-center justify-center">
                      <span className="rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground ring-1 ring-outline-variant/15">
                        {group.label}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {group.messages.map((message, idx) => {
                        const mine = message.sender_id === myProfileId;
                        const sender = participantsById.get(message.sender_id);
                        const sentAt = formatDateTime(message.created_at);
                        const sentAgo = formatRelativeTime(message.created_at);
                        const prev = group.messages[idx - 1];
                        const next = group.messages[idx + 1];
                        const firstOfRun = !prev || prev.sender_id !== message.sender_id;
                        const lastOfRun = !next || next.sender_id !== message.sender_id;
                        const isTemp = message.id.startsWith("temp-");

                        const bubbleRadius = mine
                          ? `rounded-2xl ${firstOfRun ? "rounded-tr-md" : "rounded-tr-md"} ${lastOfRun ? "rounded-br-sm" : "rounded-br-md"}`
                          : `rounded-2xl ${firstOfRun ? "rounded-tl-md" : "rounded-tl-md"} ${lastOfRun ? "rounded-bl-sm" : "rounded-bl-md"}`;

                        const isFlashing = flashedMessageId === message.id;

                        return (
                          <div
                            key={message.id}
                            ref={registerMessageRef(message.id)}
                            className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"} ${firstOfRun ? "mt-3" : ""} ${isFlashing ? "rounded-2xl ring-2 ring-accent/60 ring-offset-2 ring-offset-surface-container-lowest transition-shadow duration-500" : ""}`}
                          >
                            {!mine && (
                              <div className="w-7 shrink-0">
                                {lastOfRun ? (
                                  <div
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm"
                                    style={{ backgroundColor: `hsl(${avatarHue(message.sender_id)} 55% 45%)` }}
                                  >
                                    {getInitials(participantName(sender))}
                                  </div>
                                ) : null}
                              </div>
                            )}

                            <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                              {!mine && firstOfRun ? (
                                <p className="mb-1 px-2 text-[11px] font-semibold text-muted-foreground">
                                  {participantName(sender)}
                                </p>
                              ) : null}
                              <div
                                className={`px-3.5 py-2 text-[13.5px] leading-relaxed shadow-sm ${bubbleRadius} ${
                                  mine
                                    ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground"
                                    : "bg-surface-container-lowest text-foreground ring-1 ring-outline-variant/20"
                                } ${isTemp ? "opacity-70" : ""}`}
                              >
                                <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                {message.has_attachment && message.attachment_url ? (
                                  <a
                                    href={message.attachment_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-1.5 inline-block text-[11px] font-semibold underline underline-offset-2"
                                  >
                                    View attachment
                                  </a>
                                ) : null}
                              </div>
                              {lastOfRun ? (
                                <div className={`mt-0.5 flex items-center gap-1 px-1 ${mine ? "flex-row-reverse" : ""}`}>
                                  <span className="text-[10px] text-muted-foreground" title={sentAt}>
                                    {sentAgo}
                                  </span>
                                  {mine ? (
                                    isTemp ? (
                                      <Check className="h-3 w-3 text-muted-foreground/60" />
                                    ) : message.status === "read" ? (
                                      <CheckCheck className="h-3 w-3 text-primary" />
                                    ) : (
                                      <CheckCheck className="h-3 w-3 text-muted-foreground/70" />
                                    )
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-outline-variant/10 bg-surface-container-lowest px-4 py-3 sm:px-6">
            {error ? (
              <p className="mb-2 text-xs font-medium text-destructive">{error}</p>
            ) : null}
            <div className="flex items-end gap-2">
              <Textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Type a message..."
                rows={1}
                className="min-h-[44px] max-h-32 resize-none rounded-xl bg-surface-container-low border-outline-variant/20 text-sm"
              />
              <Button
                onClick={handleSend}
                disabled={isPending || !draft.trim()}
                size="icon"
                className="h-11 w-11 shrink-0 rounded-xl"
                aria-label="Send message"
              >
                <SendHorizontal className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-1.5 flex items-center justify-between px-1">
              <p className="text-[10px] text-muted-foreground">
                Enter to send · Shift+Enter for a new line
              </p>
              <p className="text-[10px] text-muted-foreground">{draft.trim().length}/4000</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
