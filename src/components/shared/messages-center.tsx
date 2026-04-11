"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createConversation } from "@/features/messages/actions";
import { useRealtimeConversationSync } from "@/features/messages/hooks";
import type { ConversationSummary, MessageRecipient } from "@/features/messages/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatRelativeTime, getInitials } from "@/lib/utils/formatting";
import { Inbox, MessageSquarePlus, Radio, Search, Sparkles } from "lucide-react";

function participantLabel(recipient: MessageRecipient) {
  if (recipient.display_name?.trim()) return recipient.display_name;
  if (recipient.username?.trim()) return `@${recipient.username}`;
  return recipient.id.slice(0, 8);
}

function conversationName(conversation: ConversationSummary) {
  const other = conversation.other_participants[0] ?? conversation.participants[0] ?? null;
  if (!other) return "Conversation";
  if (other.display_name?.trim()) return other.display_name;
  if (other.username?.trim()) return `@${other.username}`;
  return other.id.slice(0, 8);
}

function conversationRole(conversation: ConversationSummary) {
  const other = conversation.other_participants[0] ?? conversation.participants[0] ?? null;
  return other?.role ?? null;
}

function conversationPreview(conversation: ConversationSummary) {
  if (!conversation.last_message) return "No messages yet — start the conversation.";
  if (conversation.last_message.has_attachment) return "📎 Sent an attachment";
  return conversation.last_message.content;
}

function avatarHue(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

export function MessagesCenter({
  conversations,
  recipients,
  routeBase,
  title,
  description,
}: {
  conversations: ConversationSummary[];
  recipients: MessageRecipient[];
  routeBase: string;
  title: string;
  description: string;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<string>("");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [conversationQuery, setConversationQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const refreshDoneTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (refreshDoneTimer.current) window.clearTimeout(refreshDoneTimer.current);
    };
  }, []);

  const handleRealtimeSync = useCallback(() => {
    setIsRefreshing(true);
    router.refresh();
    if (refreshDoneTimer.current) window.clearTimeout(refreshDoneTimer.current);
    refreshDoneTimer.current = window.setTimeout(() => {
      setIsRefreshing(false);
    }, 450);
  }, [router]);

  useRealtimeConversationSync({
    enabled: true,
    onSync: handleRealtimeSync,
  });

  const filteredRecipients = useMemo(() => {
    const q = recipientQuery.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter((recipient) => {
      const label = participantLabel(recipient).toLowerCase();
      return (
        label.includes(q) ||
        recipient.role.toLowerCase().includes(q) ||
        (recipient.username ?? "").toLowerCase().includes(q)
      );
    });
  }, [recipients, recipientQuery]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unread_count, 0),
    [conversations],
  );

  const filteredConversations = useMemo(() => {
    const q = conversationQuery.trim().toLowerCase();
    let list = conversations;
    if (filter === "unread") list = list.filter((c) => c.unread_count > 0);
    if (!q) return list;
    return list.filter((conversation) => {
      const name = conversationName(conversation).toLowerCase();
      const preview = conversationPreview(conversation).toLowerCase();
      return name.includes(q) || preview.includes(q);
    });
  }, [conversations, conversationQuery, filter]);

  function handleStartConversation(participantId?: string) {
    const target = participantId ?? selectedRecipient;
    if (!target || isPending) return;

    setError(null);
    startTransition(async () => {
      const result = await createConversation({ participantId: target });
      if ("error" in result) {
        setError(result.error ?? "Failed to start conversation");
        return;
      }

      setDialogOpen(false);
      router.push(`${routeBase}/${result.data.conversationId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/20 bg-surface-container-lowest px-2.5 py-1 text-[11px] font-semibold">
            <Radio
              className={`h-3 w-3 ${
                isRefreshing ? "animate-pulse text-amber-500" : "text-emerald-600"
              }`}
            />
            {isRefreshing ? "Syncing" : "Live"}
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full">
                <MessageSquarePlus className="mr-1.5 h-4 w-4" />
                New
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-heading text-xl">Start a conversation</DialogTitle>
                <DialogDescription>
                  Search and select someone to message. Conversations are private.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={recipientQuery}
                    onChange={(e) => setRecipientQuery(e.target.value)}
                    placeholder="Search by name, username, or role..."
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <div className="max-h-72 overflow-y-auto rounded-lg border border-outline-variant/20 bg-surface-container-lowest">
                  {filteredRecipients.length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                      {recipients.length === 0
                        ? "No recipients available yet."
                        : "No matches. Try a different search."}
                    </p>
                  ) : (
                    <ul className="divide-y divide-outline-variant/10">
                      {filteredRecipients.map((recipient) => {
                        const label = participantLabel(recipient);
                        const initials = getInitials(label);
                        const hue = avatarHue(recipient.id);
                        const isSelected = selectedRecipient === recipient.id;
                        return (
                          <li key={recipient.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedRecipient(recipient.id)}
                              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                isSelected
                                  ? "bg-primary/10"
                                  : "hover:bg-surface-container-low"
                              }`}
                            >
                              <div
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                                style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}
                              >
                                {initials}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-foreground">
                                  {label}
                                </p>
                                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                  {recipient.role}
                                </p>
                              </div>
                              {isSelected ? (
                                <span className="text-[11px] font-bold uppercase text-primary">
                                  Selected
                                </span>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => handleStartConversation()}
                  disabled={!selectedRecipient || isPending}
                >
                  {isPending ? "Starting..." : "Start conversation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col gap-3 border-b border-outline-variant/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full bg-surface-container-low p-0.5 text-xs font-bold">
              <button
                onClick={() => setFilter("all")}
                className={`rounded-full px-3 py-1 transition-colors ${
                  filter === "all"
                    ? "bg-surface-container-lowest text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All
                <span className="ml-1.5 rounded-full bg-surface-container-high/60 px-1.5 text-[10px]">
                  {conversations.length}
                </span>
              </button>
              <button
                onClick={() => setFilter("unread")}
                className={`rounded-full px-3 py-1 transition-colors ${
                  filter === "unread"
                    ? "bg-surface-container-lowest text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Unread
                {totalUnread > 0 ? (
                  <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[10px] text-white">
                    {totalUnread}
                  </span>
                ) : null}
              </button>
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={conversationQuery}
              onChange={(e) => setConversationQuery(e.target.value)}
              placeholder="Search conversations..."
              className="pl-9 h-9"
            />
          </div>
        </div>

        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-container">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-base font-bold text-foreground">
              {filter === "unread" ? "No unread messages" : "No conversations yet"}
            </p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              {filter === "unread"
                ? "You're all caught up. Switch to 'All' to see every thread."
                : "Start a new conversation to message technicians and other users."}
            </p>
            {filter !== "unread" ? (
              <Button
                onClick={() => setDialogOpen(true)}
                size="sm"
                variant="outline"
                className="mt-4 rounded-full"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                New conversation
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/10">
            {filteredConversations.map((conversation) => {
              const displayName = conversationName(conversation);
              const role = conversationRole(conversation);
              const preview = conversationPreview(conversation);
              const timestamp = conversation.last_message?.created_at ?? conversation.created_at;
              const initials = getInitials(displayName || "U");
              const other = conversation.other_participants[0] ?? conversation.participants[0] ?? null;
              const hue = other ? avatarHue(other.id) : 220;
              const unread = conversation.unread_count > 0;

              return (
                <li key={conversation.id}>
                  <Link
                    href={`${routeBase}/${conversation.id}`}
                    className={`group relative flex items-center gap-3 px-5 py-3.5 transition-colors ${
                      unread ? "bg-accent/[0.04] hover:bg-accent/[0.08]" : "hover:bg-surface-container-low"
                    }`}
                  >
                    {unread ? (
                      <span className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-accent" />
                    ) : null}

                    <div
                      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
                      style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}
                    >
                      {initials}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p
                          className={`truncate text-sm text-foreground ${
                            unread ? "font-extrabold" : "font-semibold"
                          }`}
                        >
                          {displayName}
                          {role ? (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              · {role}
                            </span>
                          ) : null}
                        </p>
                        <p
                          className={`shrink-0 text-[11px] ${
                            unread ? "font-bold text-accent" : "text-muted-foreground"
                          }`}
                        >
                          {formatRelativeTime(timestamp)}
                        </p>
                      </div>
                      <p
                        className={`mt-0.5 truncate text-xs ${
                          unread ? "font-semibold text-foreground/80" : "text-muted-foreground"
                        }`}
                      >
                        {preview}
                      </p>
                    </div>

                    {unread ? (
                      <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">
                        {conversation.unread_count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
