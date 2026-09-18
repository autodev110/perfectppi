"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createConversation } from "@/features/messages/actions";
import { useRealtimeConversationSync } from "@/features/messages/hooks";
import type { ConversationSummary, MessageRecipient } from "@/features/messages/queries";
import {
  conversationPeopleLabel,
  conversationTitle,
  listingCarLabel,
  participantDisplayName,
} from "@/features/messages/format";
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
import { t as uiText } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

function participantLabel(recipient: MessageRecipient) {
  if (recipient.display_name?.trim()) return recipient.display_name;
  if (recipient.username?.trim()) return `@${recipient.username}`;
  return recipient.id.slice(0, 8);
}

function conversationName(conversation: ConversationSummary, myProfileId: string) {
  return conversationTitle(
    conversation.participants,
    myProfileId,
    conversation.listing_context,
  );
}

function conversationRole(conversation: ConversationSummary) {
  const other = conversation.other_participants[0] ?? conversation.participants[0] ?? null;
  return other?.role ?? null;
}

/** Initials come from the counterparty, not the full two-person title. */
function conversationAvatarSeed(conversation: ConversationSummary, myProfileId: string) {
  return (
    conversation.other_participants[0] ??
    conversation.participants.find((p) => p.id !== myProfileId) ??
    conversation.participants[0] ??
    null
  );
}

function conversationPreview(conversation: ConversationSummary) {
  if (!conversation.last_message) return uiText("ui.no_messages_yet_start_the_conversation_150c76c28e");
  if (conversation.last_message.has_attachment) return uiText("ui.sent_an_attachment_53469c71fe");
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
  requests,
  recipients,
  routeBase,
  myProfileId,
  title,
  description,
}: {
  conversations: ConversationSummary[];
  requests: ConversationSummary[];
  recipients: MessageRecipient[];
  routeBase: string;
  myProfileId: string;
  title: string;
  description: string;
}) {
  const uiText = useTranslator();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<string>("");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [conversationQuery, setConversationQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "requests">("all");
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
    let list = filter === "requests" ? requests : conversations;
    if (filter === "unread") list = list.filter((c) => c.unread_count > 0);
    if (!q) return list;
    return list.filter((conversation) => {
      const name = conversationName(conversation, myProfileId).toLowerCase();
      const preview = conversationPreview(conversation).toLowerCase();
      return name.includes(q) || preview.includes(q);
    });
  }, [conversations, requests, conversationQuery, filter, myProfileId]);

  function handleStartConversation(participantId?: string) {
    const target = participantId ?? selectedRecipient;
    if (!target || isPending) return;

    setError(null);
    startTransition(async () => {
      const result = await createConversation({ participantId: target });
      if ("error" in result) {
        setError(result.error ?? uiText("ui.failed_to_start_conversation_6ba48fbb4e"));
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
            {isRefreshing ? uiText("ui.syncing_5c8b9e1ce0") : uiText("ui.live_b64ac05f17")}
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full">
                <MessageSquarePlus className="mr-1.5 h-4 w-4" />{uiText("ui.new_18fdd549b2")}</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-heading text-xl">{uiText("ui.start_a_conversation_258150cb3e")}</DialogTitle>
                <DialogDescription>{uiText("ui.friends_receive_messages_directly_eligible_g_bb0461a2eb")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={recipientQuery}
                    onChange={(e) => setRecipientQuery(e.target.value)}
                    placeholder={uiText("ui.search_by_name_username_or_role_a1cf7760f9")}
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <div className="max-h-72 overflow-y-auto rounded-lg border border-outline-variant/20 bg-surface-container-lowest">
                  {filteredRecipients.length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                      {recipients.length === 0
                        ? uiText("ui.no_recipients_available_yet_006c1bb9f0")
                        : uiText("ui.no_matches_try_a_different_search_26d1e5a68e")}
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
                                <p className="text-[11px] text-muted-foreground">
                                  {recipient.contact_mode === "request"
                                    ? uiText("ui.message_request_via_38926c6aa5", { arg0: String(recipient.shared_group_name ?? uiText("ui.shared_group_eed6076c23")) })
                                    : uiText("ui.friend_8c6e172b1f", { arg0: String(recipient.role) })}
                                </p>
                              </div>
                              {isSelected ? (
                                <span className="text-[11px] font-bold uppercase text-primary">{uiText("ui.selected_57fd7a0cf3")}</span>
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
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>{uiText("ui.cancel_19766ed6cc")}</Button>
                <Button
                  onClick={() => handleStartConversation()}
                  disabled={!selectedRecipient || isPending}
                >
                  {isPending ? uiText("ui.starting_82b93630a9") : uiText("ui.start_conversation_b61625d09b")}
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
              >{uiText("ui.all_a52ace420f")}<span className="ml-1.5 rounded-full bg-surface-container-high/60 px-1.5 text-[10px]">
                  {conversations.length}
                </span>
              </button>
              <button
                onClick={() => setFilter("requests")}
                className={`rounded-full px-3 py-1 transition-colors ${
                  filter === "requests"
                    ? "bg-surface-container-lowest text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >{uiText("ui.requests_ada27592c9")}{requests.length > 0 ? (
                  <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[10px] text-white">
                    {requests.length}
                  </span>
                ) : null}
              </button>
              <button
                onClick={() => setFilter("unread")}
                className={`rounded-full px-3 py-1 transition-colors ${
                  filter === "unread"
                    ? "bg-surface-container-lowest text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >{uiText("ui.unread_1b9f384c14")}{totalUnread > 0 ? (
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
              placeholder={uiText("ui.search_conversations_e90dd01731")}
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
              {filter === "unread"
                ? uiText("ui.no_unread_messages_41080bff99")
                : filter === "requests"
                  ? uiText("ui.no_message_requests_08b2a977c3")
                  : uiText("ui.no_conversations_yet_0d60084f05")}
            </p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              {filter === "unread"
                ? uiText("ui.you_re_all_caught_up_switch_to_all_to_see_ev_f7a679d341")
                : filter === "requests"
                  ? uiText("ui.eligible_group_member_introductions_will_wai_4dc4b307b1")
                  : uiText("ui.start_a_conversation_with_a_friend_or_eligib_32fd6066b6")}
            </p>
            {filter === "all" ? (
              <Button
                onClick={() => setDialogOpen(true)}
                size="sm"
                variant="outline"
                className="mt-4 rounded-full"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />{uiText("ui.new_conversation_396c946f0c")}</Button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/10">
            {filteredConversations.map((conversation) => {
              const peopleLabel = conversationPeopleLabel(
                conversation.participants,
                myProfileId,
              ) || uiText("ui.conversation_ccca181757");
              const carLabel = listingCarLabel(conversation.listing_context);
              const role = conversationRole(conversation);
              const preview = conversationPreview(conversation);
              const timestamp = conversation.last_message?.created_at ?? conversation.created_at;
              const other = conversationAvatarSeed(conversation, myProfileId);
              const initials = getInitials(other ? participantDisplayName(other) : peopleLabel);
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
                          {peopleLabel}
                          {filter === "requests" ? (
                            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-accent">{uiText("ui.request_59f03d642b")}</span>
                          ) : null}
                          {carLabel ? (
                            <span className="ml-1.5 text-xs font-semibold text-muted-foreground">
                              · {carLabel}
                            </span>
                          ) : role ? (
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
