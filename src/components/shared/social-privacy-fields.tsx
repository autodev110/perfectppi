import Link from "next/link";
import { Label } from "@/components/ui/label";
import type { Database } from "@/types/database";

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
        <legend className="px-1 text-sm font-semibold">Profile privacy</legend>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="is_public"
            value="true"
            defaultChecked={profile?.is_public ?? false}
            className="mt-1 rounded"
          />
          <span>
            <span className="block text-sm font-medium">Public inside PerfectPPI</span>
            <span className="block text-xs text-muted-foreground">Signed-in members can view posts you mark Public. This does not publish your profile to the open web.</span>
          </span>
        </label>
        <div className="space-y-2">
          <Label htmlFor="default_post_audience">Default post audience</Label>
          <select
            id="default_post_audience"
            name="default_post_audience"
            defaultValue={profile?.default_post_audience ?? "friends"}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          >
            <option value="friends">Friends</option>
            <option value="public">Public inside PerfectPPI</option>
          </select>
          <p className="text-xs text-muted-foreground">Private profiles always use Friends, even if an older app requests Public. Going private immediately changes your Public posts to Friends.</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Not sure what others see?{" "}
          <Link href="/dashboard/profile/preview" className="font-semibold text-primary underline underline-offset-2">View as stranger</Link>
        </p>
      </fieldset>

      <details className="group rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Advanced privacy
          <span className="ml-2 font-normal text-muted-foreground">discovery, requests, messages</span>
        </summary>
        <div className="mt-4 space-y-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="discoverable" value="true" defaultChecked={profile?.discoverable ?? true} className="mt-1 rounded" />
            <span>
              <span className="block text-sm font-medium">Appear in discovery</span>
              <span className="block text-xs text-muted-foreground">Allow partial-name and suggestion results. Default: on.</span>
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
              <span className="block text-sm font-medium">Allow exact username lookup</span>
              <span className="block text-xs text-muted-foreground">People who enter your complete username can find your limited profile. Default: on.</span>
            </span>
          </label>
          <div className="space-y-2">
            <Label htmlFor="friend_request_policy">Who can send you friend requests</Label>
            <select
              id="friend_request_policy"
              name="friend_request_policy"
              defaultValue={profile?.friend_request_policy ?? "everyone"}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            >
              <option value="everyone">Everyone</option>
              <option value="friends_of_friends">Friends of friends</option>
              <option value="nobody">Nobody</option>
            </select>
            <p className="text-xs text-muted-foreground">Default: everyone. You can still send requests yourself, and blocked members can never send one.</p>
          </div>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="allow_friend_messages" value="true" defaultChecked={profile?.allow_friend_messages ?? true} className="mt-1 rounded" />
            <span>
              <span className="block text-sm font-medium">Messages with friends</span>
              <span className="block text-xs text-muted-foreground">Allow friends to start and continue direct conversations. Both people must allow friend messages.</span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="allow_group_message_requests" value="true" defaultChecked={profile?.allow_group_message_requests ?? false} className="mt-1 rounded" />
            <span>
              <span className="block text-sm font-medium">Requests from group members</span>
              <span className="block text-xs text-muted-foreground">People in a group with you may send one introduction. Their thread stays in Requests until you accept it. Default: off.</span>
            </span>
          </label>
          <div className="space-y-2">
            <Label htmlFor="mention_policy">Who can mention you</Label>
            <select
              id="mention_policy"
              name="mention_policy"
              defaultValue={profile?.mention_policy ?? "friends_and_groups"}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            >
              <option value="everyone">Everyone who can see the post</option>
              <option value="friends_and_groups">Friends and group members</option>
              <option value="friends">Friends only</option>
              <option value="nobody">Nobody</option>
            </select>
            <p className="text-xs text-muted-foreground">Mentions link to your profile and notify you only when you can view the post. Default: friends and group members.</p>
          </div>
        </div>
      </details>
    </div>
  );
}
