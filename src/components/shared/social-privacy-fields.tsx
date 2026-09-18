import Link from "next/link";
import { Label } from "@/components/ui/label";
import type { Database } from "@/types/database";
import { t as uiText } from "@/lib/i18n";

type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  | "is_public"
  | "default_post_audience"
  | "discoverable"
  | "allow_exact_username_lookup"
  | "friend_request_policy"
  | "allow_friend_messages"
  | "allow_group_message_requests"
  | "mention_policy"
>;

// Plan 9.3: profile privacy and the default audience up top; discovery,
// exact lookup, and friend-request policy under Advanced Privacy with the
// current default spelled out in plain language.
export function SocialPrivacyFields({ profile }: { profile: Profile | null }) {
  return (
    <div className="space-y-4">
      <fieldset className="space-y-4 rounded-xl border p-4">
        <legend className="px-1 text-sm font-semibold">{uiText("ui.profile_privacy_4dab06a43e")}</legend>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="is_public"
            value="true"
            defaultChecked={profile?.is_public ?? false}
            className="mt-1 rounded"
          />
          <span>
            <span className="block text-sm font-medium">{uiText("ui.public_inside_perfectppi_59260e8311")}</span>
            <span className="block text-xs text-muted-foreground">{uiText("ui.signed_in_members_can_view_posts_you_mark_pu_a9afa5a09c")}</span>
          </span>
        </label>
        <div className="space-y-2">
          <Label htmlFor="default_post_audience">{uiText("ui.default_post_audience_e7f057b277")}</Label>
          <select
            id="default_post_audience"
            name="default_post_audience"
            defaultValue={profile?.default_post_audience ?? "friends"}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          >
            <option value="friends">{uiText("ui.friends_bd104d1b98")}</option>
            <option value="public">{uiText("ui.public_inside_perfectppi_59260e8311")}</option>
          </select>
          <p className="text-xs text-muted-foreground">{uiText("ui.private_profiles_always_use_friends_even_if__d2b5e81133")}</p>
        </div>
        <p className="text-xs text-muted-foreground">{uiText("ui.not_sure_what_others_see_acf0153868")}{" "}
          <Link href="/dashboard/profile/preview" className="font-semibold text-primary underline underline-offset-2">{uiText("ui.view_as_stranger_78ae0f21fb")}</Link>
        </p>
      </fieldset>

      <details className="group rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-semibold">{uiText("ui.advanced_privacy_fbd2a38730")}<span className="ml-2 font-normal text-muted-foreground">{uiText("ui.discovery_requests_messages_291f328f11")}</span>
        </summary>
        <div className="mt-4 space-y-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="discoverable" value="true" defaultChecked={profile?.discoverable ?? true} className="mt-1 rounded" />
            <span>
              <span className="block text-sm font-medium">{uiText("ui.appear_in_discovery_42f299fcd0")}</span>
              <span className="block text-xs text-muted-foreground">{uiText("ui.allow_partial_name_and_suggestion_results_de_82949f45d2")}</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="allow_exact_username_lookup"
              value="true"
              defaultChecked={profile?.allow_exact_username_lookup ?? true}
              className="mt-1 rounded"
            />
            <span>
              <span className="block text-sm font-medium">{uiText("ui.allow_exact_username_lookup_ff1d3dc144")}</span>
              <span className="block text-xs text-muted-foreground">{uiText("ui.people_who_enter_your_complete_username_can__85cf859a4b")}</span>
            </span>
          </label>
          <div className="space-y-2">
            <Label htmlFor="friend_request_policy">{uiText("ui.who_can_send_you_friend_requests_1df949d52e")}</Label>
            <select
              id="friend_request_policy"
              name="friend_request_policy"
              defaultValue={profile?.friend_request_policy ?? "everyone"}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            >
              <option value="everyone">{uiText("ui.everyone_da2e5dc515")}</option>
              <option value="friends_of_friends">{uiText("ui.friends_of_friends_192dcde67f")}</option>
              <option value="nobody">{uiText("ui.nobody_3fad99b521")}</option>
            </select>
            <p className="text-xs text-muted-foreground">{uiText("ui.default_everyone_you_can_still_send_requests_f28f7f07da")}</p>
          </div>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="allow_friend_messages" value="true" defaultChecked={profile?.allow_friend_messages ?? true} className="mt-1 rounded" />
            <span>
              <span className="block text-sm font-medium">{uiText("ui.messages_with_friends_87ca3cea5e")}</span>
              <span className="block text-xs text-muted-foreground">{uiText("ui.allow_friends_to_start_and_continue_direct_c_44888eeecd")}</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="allow_group_message_requests" value="true" defaultChecked={profile?.allow_group_message_requests ?? false} className="mt-1 rounded" />
            <span>
              <span className="block text-sm font-medium">{uiText("ui.requests_from_group_members_46482ccdad")}</span>
              <span className="block text-xs text-muted-foreground">{uiText("ui.people_in_a_group_with_you_may_send_one_intr_826d4c6e82")}</span>
            </span>
          </label>
          <div className="space-y-2">
            <Label htmlFor="mention_policy">{uiText("ui.who_can_mention_you_c8c4fafe9c")}</Label>
            <select
              id="mention_policy"
              name="mention_policy"
              defaultValue={profile?.mention_policy ?? "friends_and_groups"}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            >
              <option value="everyone">{uiText("ui.everyone_who_can_see_the_post_18a448714d")}</option>
              <option value="friends_and_groups">{uiText("ui.friends_and_group_members_d843fbd36a")}</option>
              <option value="friends">{uiText("ui.friends_only_9f75521f3c")}</option>
              <option value="nobody">{uiText("ui.nobody_3fad99b521")}</option>
            </select>
            <p className="text-xs text-muted-foreground">{uiText("ui.mentions_link_to_your_profile_and_notify_you_ad70501250")}</p>
          </div>
        </div>
      </details>
    </div>
  );
}
