"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Tags, Users, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { POST_TYPE_LABELS, type PostType } from "@/lib/community/post-types";

type FeedMuteRequest =
  | { scope: "group"; groupId: string; muted: true }
  | { scope: "post_type"; postType: PostType; muted: true }
  | { scope: "vehicle_topic"; vehicleMake: string; vehicleModel: string | null; muted: true };

export function CommunityFeedMuteMenu({
  group,
  postType,
  vehicle,
}: {
  group: { id: string; name: string } | null;
  postType: PostType;
  vehicle: { make: string | null; model: string | null } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const make = vehicle?.make?.trim() || null;
  const model = vehicle?.model?.trim() || null;
  const vehicleLabel = [make, model].filter(Boolean).join(" ");
  const typeLabel = POST_TYPE_LABELS[postType].label;

  async function mute(request: FeedMuteRequest, label: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/community/feed-mutes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "This feed preference could not be saved.");
      toast.success(`${label} will no longer appear in your feed.`, {
        description: "Your group memberships and friendships were not changed.",
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "This feed preference could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-full" disabled={busy} aria-label="Feed options">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Hide from my feed</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {group ? (
          <DropdownMenuItem onSelect={() => mute({ scope: "group", groupId: group.id, muted: true }, group.name)}>
            <Users />
            <span>Mute {group.name}</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => mute({ scope: "post_type", postType, muted: true }, typeLabel)}>
          <Tags />
          <span>Mute {typeLabel.toLowerCase()} posts</span>
        </DropdownMenuItem>
        {make ? (
          <DropdownMenuItem onSelect={() => mute({ scope: "vehicle_topic", vehicleMake: make, vehicleModel: model, muted: true }, vehicleLabel)}>
            <VolumeX />
            <span>Mute {vehicleLabel} posts</span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
