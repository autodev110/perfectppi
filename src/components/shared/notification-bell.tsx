"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeNotifications } from "@/features/notifications/hooks";
import { markAllNotificationsRead, markNotificationRead } from "@/features/notifications/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, CheckCheck, MessageSquare, ShieldCheck, CreditCard, FileText, Wrench } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils/formatting";
import type { Database } from "@/types/database";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type NotificationType = NotificationRow["type"];

const typeStyle: Record<
  NotificationType,
  { icon: typeof Bell; color: string; bg: string }
> = {
  message_received: { icon: MessageSquare, color: "text-sky-600", bg: "bg-sky-50" },
  tech_request_new: { icon: Wrench, color: "text-indigo-600", bg: "bg-indigo-50" },
  tech_request_accepted: { icon: Wrench, color: "text-emerald-600", bg: "bg-emerald-50" },
  inspection_submitted: { icon: FileText, color: "text-amber-600", bg: "bg-amber-50" },
  inspection_updated: { icon: FileText, color: "text-amber-600", bg: "bg-amber-50" },
  warranty_available: { icon: ShieldCheck, color: "text-violet-600", bg: "bg-violet-50" },
  payment_completed: { icon: CreditCard, color: "text-emerald-600", bg: "bg-emerald-50" },
};

export function NotificationBell({ messagesBase }: { messagesBase: string }) {
  const router = useRouter();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      if (data) setProfileId(data.id);
    });
  }, []);

  const { notifications, unreadCount, refetch } = useRealtimeNotifications(profileId);

  const sorted = useMemo(() => {
    return [...notifications].sort((a, b) => {
      if (!!a.read_at !== !!b.read_at) return a.read_at ? 1 : -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [notifications]);

  async function handleMarkAll() {
    startTransition(async () => {
      await markAllNotificationsRead();
      await refetch();
    });
  }

  function routeForNotification(n: NotificationRow): string | null {
    const data = (n.data ?? {}) as Record<string, unknown>;
    if (n.type === "message_received" && typeof data.conversation_id === "string") {
      const base = `${messagesBase}/${data.conversation_id}`;
      if (typeof data.message_id === "string") {
        return `${base}?m=${encodeURIComponent(data.message_id)}`;
      }
      return base;
    }
    return null;
  }

  async function handleClickNotification(n: NotificationRow) {
    const destination = routeForNotification(n);
    setOpen(false);

    if (!n.read_at) {
      startTransition(async () => {
        await markNotificationRead(n.id);
        await refetch();
      });
    }

    if (destination) {
      router.push(destination);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <>
              <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
              <span className="absolute -right-0.5 -top-0.5 h-[18px] w-[18px] animate-ping rounded-full bg-accent/40" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-bold text-foreground">Notifications</p>
            <p className="text-[11px] text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              className="inline-flex items-center gap-1 rounded-full border border-outline-variant/20 bg-surface-container-low px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-surface-container"
            >
              <CheckCheck className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-[26rem] overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-surface-container">
                <Bell className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground">No notifications</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                New activity will show up here.
              </p>
            </div>
          ) : (
            <ul className="py-1">
              {sorted.map((n) => {
                const cfg = typeStyle[n.type];
                const Icon = cfg.icon;
                const unread = !n.read_at;

                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClickNotification(n)}
                      className={`group relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                        unread ? "bg-accent/5 hover:bg-accent/10" : "hover:bg-surface-container-low"
                      }`}
                    >
                      {unread ? (
                        <span className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent" />
                      ) : null}

                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cfg.bg}`}>
                        <Icon className={`h-4 w-4 ${cfg.color}`} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm leading-tight ${unread ? "font-bold" : "font-semibold"} text-foreground`}>
                          {n.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {n.body}
                        </p>
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                          {formatRelativeTime(n.created_at)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
