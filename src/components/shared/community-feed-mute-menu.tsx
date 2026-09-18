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

import { useTranslator } from "@/lib/i18n/client";

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
  const uiText = useTranslator();
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
      if (!response.ok) throw new Error(payload?.error || uiText("ui.this_feed_preference_could_not_be_saved_74f0af4c55"));
      toast.success(uiText("ui.will_no_longer_appear_in_your_feed_8e2e1300ec", { arg0: String(label) }), {
        description: uiText("ui.your_group_memberships_and_friendships_were__eeab6abc82"),
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : uiText("ui.this_feed_preference_could_not_be_saved_74f0af4c55"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-full" disabled={busy} aria-label={uiText("ui.feed_options_0a12fbcd8c")}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{uiText("ui.hide_from_my_feed_3dd42452cc")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {group ? (
          <DropdownMenuItem onSelect={() => mute({ scope: "group", groupId: group.id, muted: true }, group.name)}>
            <Users />
            <span>{uiText("ui.mute_f801efe9a3")}{group.name}</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => mute({ scope: "post_type", postType, muted: true }, typeLabel)}>
          <Tags />
          <span>{uiText("ui.mute_f801efe9a3")}{typeLabel.toLowerCase()}{uiText("ui.posts_e8468d49b5")}</span>
        </DropdownMenuItem>
        {make ? (
          <DropdownMenuItem onSelect={() => mute({ scope: "vehicle_topic", vehicleMake: make, vehicleModel: model, muted: true }, vehicleLabel)}>
            <VolumeX />
            <span>{uiText("ui.mute_f801efe9a3")}{vehicleLabel}{uiText("ui.posts_e8468d49b5")}</span>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
