import { Label } from "@/components/ui/label";
import type { Database } from "@/types/database";

type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  | "is_public"
  | "default_post_audience"
  | "discoverable"
  | "allow_exact_username_lookup"
>;

export function SocialPrivacyFields({ profile }: { profile: Profile | null }) {
  return (
    <fieldset className="space-y-4 rounded-xl border p-4">
      <legend className="px-1 text-sm font-semibold">Privacy</legend>
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
        <p className="text-xs text-muted-foreground">Private profiles always use Friends, even if an older app requests Public.</p>
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="discoverable" value="true" defaultChecked={profile?.discoverable ?? true} className="mt-1 rounded" />
        <span>
          <span className="block text-sm font-medium">Appear in discovery</span>
          <span className="block text-xs text-muted-foreground">Allow partial-name and suggestion results.</span>
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
          <span className="block text-xs text-muted-foreground">People who enter your complete username can find your limited profile.</span>
        </span>
      </label>
    </fieldset>
  );
}
