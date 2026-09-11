"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decideMessageRequest, markConversationRead, sendMessage } from "@/features/messages/actions";
import { uploadFile } from "@/features/uploads/client";
import {
  conversationPeopleLabel,
  listingCarLabel,
  participantDisplayName,
} from "@/features/messages/format";
import type { ConversationListingContext } from "@/features/messages/queries";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatRelativeTime, getInitials } from "@/lib/utils/formatting";
import { ArrowLeft, Car, Radio, SendHorizontal, CheckCheck, Check, FileText, Paperclip, X } from "lucide-react";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

type Participant = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "display_name" | "username" | "role"
>;

const participantName = participantDisplayName;

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
  listingContext,
  messages: initialMessages,
  highlightMessageId,
  requestStatus: initialRequestStatus,
  requestedBy,
}: {
  conversationId: string;
  routeBase: string;
  myProfileId: string;
  participants: Participant[];
  listingContext?: ConversationListingContext | null;
  messages: MessageRow[];
  highlightMessageId?: string;
  requestStatus: "pending" | "accepted";
  requestedBy: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [liveConnected, setLiveConnected] = useState(false);
  const [flashedMessageId, setFlashedMessageId] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState(initialRequestStatus);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
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
  const primaryOtherInitials = getInitials(
    primaryOther ? participantName(primaryOther) : "?",
  );
  const primaryOtherHue = primaryOther ? avatarHue(primaryOther.id) : 220;

  // Title names everyone in the thread; the car it is about (marketplace
  // threads) sits on the subtitle line so it survives a narrow header.
  const peopleLabel =
    conversationPeopleLabel(participants, myProfileId) || "No participants";
  const carLabel = listingCarLabel(listingContext);
  const incomingRequest = requestStatus === "pending" && requestedBy !== myProfileId;
  const outgoingRequest = requestStatus === "pending" && requestedBy === myProfileId;
  const canCompose = requestStatus === "accepted" || (outgoingRequest && messages.length === 0);

  const refetch = useCallback(async () => {
    const response = await fetch(`/api/messages/conversations/${conversationId}/messages`, {
      cache: "no-store",
    });
    const payload = response.ok ? await response.json() as { data?: MessageRow[] } : null;
    const data = payload?.data;

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
    if (hasUnreadIncoming && !incomingRequest) void markCurrentConversationRead();
  }, [incomingRequest, markCurrentConversationRead, messages, myProfileId]);

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
    if ((!content && !attachment) || isPending || !canCompose) return;

    setError(null);
    const selectedAttachment = attachment;

    startTransition(async () => {
      let attachmentUrl: string | undefined;
      try {
        if (selectedAttachment) {
          setUploadProgress(0);
          attachmentUrl = await uploadFile(
            selectedAttachment,
            "message_attachment",
            conversationId,
            setUploadProgress,
          );
        }
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Failed to upload attachment");
        setUploadProgress(null);
        return;
      } finally {
        setUploadProgress(null);
      }

      const tempId = `temp-${Date.now()}`;
      const optimistic: MessageRow = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: myProfileId,
        content,
        has_attachment: Boolean(attachmentUrl),
        attachment_url: attachmentUrl ?? null,
        attachment_type: selectedAttachment?.type ?? null,
        status: "unread",
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimistic]);
      setDraft("");
      setAttachment(null);
      textareaRef.current?.focus();

      const result = await sendMessage({
        conversationId,
        content,
        attachmentUrl,
        attachmentType: selectedAttachment?.type,
      });

      if ("error" in result) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setDraft(content);
        setAttachment(selectedAttachment);
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

  function handleRequestDecision(decision: "accept" | "decline") {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await decideMessageRequest({ conversationId, decision });
      if ("error" in result) {
        setError(result.error ?? "Could not update the message request");
        return;
      }
      if (decision === "decline") {
        router.push(routeBase);
        router.refresh();
        return;
      }
      setRequestStatus("accepted");
      await markCurrentConversationRead();
      router.refresh();
    });
  }

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
              {peopleLabel}
            </h1>
            {carLabel ? (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-semibold text-muted-foreground">
                <Car className="h-3 w-3 shrink-0" />
                <span className="truncate">{carLabel}</span>
              </p>
            ) : primaryOther ? (
              <p className="mt-0.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                {primaryOther.role}
              </p>
            ) : null}
          </div>
        </div>

        <CardContent className="p-0">
          {incomingRequest ? (
            <div className="border-b border-outline-variant/10 bg-amber-50 px-5 py-4 text-amber-950">
              <p className="text-sm font-bold">Message request</p>
              <p className="mt-1 text-xs">This group member can only continue messaging if you accept. Opening this request does not send a read receipt.</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => handleRequestDecision("accept")} disabled={isPending}>Accept</Button>
                <Button size="sm" variant="outline" onClick={() => handleRequestDecision("decline")} disabled={isPending}>Decline</Button>
              </div>
            </div>
          ) : outgoingRequest ? (
            <div className="border-b border-outline-variant/10 bg-surface-container-low px-5 py-3 text-xs text-muted-foreground">
              {messages.length === 0
                ? "Send one introduction. You can continue after this member accepts your request."
                : "Message request sent. You can continue if this member accepts."}
            </div>
          ) : null}
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
                                {message.content ? <p className="whitespace-pre-wrap break-words">{message.content}</p> : null}
                                {message.has_attachment && message.attachment_url ? (
                                  message.attachment_type?.startsWith("image/") ? (
                                    <a href={message.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-2 block overflow-hidden rounded-lg">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={message.attachment_url} alt="Message attachment" className="max-h-72 w-full object-cover" />
                                    </a>
                                  ) : message.attachment_type?.startsWith("video/") ? (
                                    <video src={message.attachment_url} controls playsInline preload="metadata" className="mt-2 max-h-72 w-full rounded-lg" />
                                  ) : (
                                    <a href={message.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-[11px] font-semibold underline underline-offset-2">
                                      <FileText className="h-4 w-4" />
                                      Open attachment
                                    </a>
                                  )
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
            {!canCompose ? (
              <p className="rounded-xl bg-surface-container-low px-4 py-3 text-center text-xs text-muted-foreground">
                {incomingRequest ? "Accept this request to reply." : "Waiting for this member to accept your request."}
              </p>
            ) : attachment ? (
              <div className="mb-2 rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{attachment.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {uploadProgress === null
                        ? `${Math.ceil(attachment.size / 1024)} KB`
                        : `Uploading… ${Math.round(uploadProgress * 100)}%`}
                    </p>
                  </div>
                  {uploadProgress === null ? (
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setAttachment(null)} aria-label="Remove attachment">
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                {uploadProgress === null ? null : (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-outline-variant/30">
                    <div
                      className="h-full bg-primary transition-[width] duration-150"
                      style={{ width: `${Math.round(uploadProgress * 100)}%` }}
                      role="progressbar"
                      aria-label="Attachment upload progress"
                      aria-valuenow={Math.round(uploadProgress * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                )}
              </div>
            ) : null}
            <input
              ref={attachmentInputRef}
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                const picked = event.target.files?.[0];
                // An empty selection means the picker was dismissed — keep
                // whatever was already staged instead of clearing it.
                if (picked) setAttachment(picked);
                event.currentTarget.value = "";
              }}
            />
            {canCompose ? <div className="flex items-end gap-2">
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 rounded-xl" onClick={() => attachmentInputRef.current?.click()} disabled={isPending} aria-label="Add attachment">
                <Paperclip className="h-4 w-4" />
              </Button>
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
                disabled={isPending || (!draft.trim() && !attachment)}
                size="icon"
                className="h-11 w-11 shrink-0 rounded-xl"
                aria-label="Send message"
              >
                <SendHorizontal className="h-4 w-4" />
              </Button>
            </div> : null}
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
