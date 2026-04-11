"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

export function useRealtimeMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    setMessages(data ?? []);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;

    fetchMessages();

    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          fetchMessages();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, fetchMessages]);

  return { messages, loading, refetch: fetchMessages };
}

export function useRealtimeConversationSync({
  enabled,
  onSync,
  debounceMs = 250,
}: {
  enabled: boolean;
  onSync: () => void;
  debounceMs?: number;
}) {
  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    let timer: number | null = null;

    const scheduleSync = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        onSync();
      }, debounceMs);
    };

    const channel = supabase
      .channel("conversation-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        scheduleSync,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        scheduleSync,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_participants" },
        scheduleSync,
      )
      .subscribe();

    return () => {
      if (timer) window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [enabled, onSync, debounceMs]);
}
