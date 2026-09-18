"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  allowedJoinPolicies,
  GROUP_CATEGORIES,
  GROUP_CATEGORY_LABELS,
  GROUP_JOIN_POLICY_LABELS,
  GROUP_VISIBILITIES,
  GROUP_VISIBILITY_LABELS,
  type GroupJoinPolicyOption,
  type GroupVisibilityOption,
} from "@/lib/social/group-options";

import { useTranslator } from "@/lib/i18n/client";

export type GroupSettingsValues = {
  slug?: string;
  name: string;
  description: string;
  category: string;
  rules: string[];
  vehicleMake: string;
  vehicleModel: string;
  yearStart: number | null;
  yearEnd: number | null;
  locationRegion: string;
  postingPolicy: "members" | "moderators";
  visibility: GroupVisibilityOption;
  joinPolicy: GroupJoinPolicyOption;
};

// Create (mode "create", slug editable) or edit (mode "edit", slug fixed) a
// member group (plan 13.2, 13.3). Visibility drives the join policies on
// offer: Public groups may be Open; Private and Unlisted groups need request
// approval or invitations.
export function GroupSettingsForm({
  mode,
  initial,
  slugForUpdate,
}: {
  mode: "create" | "edit";
  initial: GroupSettingsValues;
  slugForUpdate?: string;
}) {
  const uiText = useTranslator();
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [rulesText, setRulesText] = useState(initial.rules.join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof GroupSettingsValues>(key: K, value: GroupSettingsValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function updateVisibility(visibility: GroupVisibilityOption) {
    setValues((current) => {
      const policies = allowedJoinPolicies(visibility);
      return { ...current, visibility, joinPolicy: policies.includes(current.joinPolicy) ? current.joinPolicy : policies[0] };
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const body = {
      ...values,
      rules: rulesText.split("\n").map((rule) => rule.trim()).filter(Boolean),
      yearStart: values.yearStart || null,
      yearEnd: values.yearEnd || null,
    };
    try {
      const response = await fetch(
        mode === "create" ? "/api/community/groups" : `/api/community/groups/${encodeURIComponent(slugForUpdate ?? "")}`,
        { method: mode === "create" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      const payload = (await response.json().catch(() => null)) as { data?: { slug: string }; error?: string } | null;
      if (!response.ok || !payload?.data) throw new Error(payload?.error ?? uiText("ui.the_group_could_not_be_saved_c4df10fde3"));
      router.push(`/community/groups/${payload.data.slug}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText("ui.the_group_could_not_be_saved_c4df10fde3"));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="group-name">{uiText("ui.group_name_762ebb70ef")}</Label>
          <Input id="group-name" required minLength={2} maxLength={80} value={values.name} onChange={(e) => update("name", e.target.value)} />
        </div>
        {mode === "create" ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="group-slug">{uiText("ui.group_address_18f88df57a")}</Label>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{uiText("ui.community_groups_58a1a315e1")}</span>
              <Input
                id="group-slug"
                required
                minLength={3}
                maxLength={64}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={values.slug ?? ""}
                onChange={(e) => update("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder={uiText("ui.miata_meetups_479db0fbf6")}
                aria-describedby="group-slug-help"
              />
            </div>
            <p id="group-slug-help" className="text-xs text-muted-foreground">{uiText("ui.lowercase_letters_numbers_and_hyphens_this_c_2f7a0cabc1")}</p>
          </div>
        ) : null}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="group-description">{uiText("ui.description_526e0087cc")}</Label>
          <Textarea id="group-description" required maxLength={500} rows={3} value={values.description} onChange={(e) => update("description", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-category">{uiText("ui.category_292c06f004")}</Label>
          <select id="group-category" value={values.category} onChange={(e) => update("category", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm">
            {GROUP_CATEGORIES.map((category) => <option key={category} value={category}>{GROUP_CATEGORY_LABELS[category]}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-posting">{uiText("ui.who_can_post_cabffe47d7")}</Label>
          <select id="group-posting" value={values.postingPolicy} onChange={(e) => update("postingPolicy", e.target.value as "members" | "moderators")} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm">
            <option value="members">{uiText("ui.all_members_3d6fe3e703")}</option>
            <option value="moderators">{uiText("ui.moderators_only_announcements_4e728c3af2")}</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-visibility">{uiText("ui.visibility_7448611d5f")}</Label>
          <select id="group-visibility" value={values.visibility} onChange={(e) => updateVisibility(e.target.value as GroupVisibilityOption)} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" aria-describedby="group-visibility-help">
            {GROUP_VISIBILITIES.map((visibility) => <option key={visibility} value={visibility}>{GROUP_VISIBILITY_LABELS[visibility].label}</option>)}
          </select>
          <p id="group-visibility-help" className="text-xs text-muted-foreground">{GROUP_VISIBILITY_LABELS[values.visibility].hint}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-join">{uiText("ui.how_members_join_c46eb3cc00")}</Label>
          <select id="group-join" value={values.joinPolicy} onChange={(e) => update("joinPolicy", e.target.value as GroupJoinPolicyOption)} className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" aria-describedby="group-join-help">
            {allowedJoinPolicies(values.visibility).map((policy) => <option key={policy} value={policy}>{GROUP_JOIN_POLICY_LABELS[policy].label}</option>)}
          </select>
          <p id="group-join-help" className="text-xs text-muted-foreground">{GROUP_JOIN_POLICY_LABELS[values.joinPolicy].hint}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-make">{uiText("ui.make_optional_44a838ced1")}</Label>
          <Input id="group-make" maxLength={64} value={values.vehicleMake} onChange={(e) => update("vehicleMake", e.target.value)} placeholder={uiText("ui.mazda_dc88f97183")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-model">{uiText("ui.model_optional_caa6106f12")}</Label>
          <Input id="group-model" maxLength={64} value={values.vehicleModel} onChange={(e) => update("vehicleModel", e.target.value)} placeholder={uiText("ui.mx_5_a592d8f960")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-year-start">{uiText("ui.from_year_optional_899bf595fd")}</Label>
          <Input id="group-year-start" type="number" min={1886} max={2100} value={values.yearStart ?? ""} onChange={(e) => update("yearStart", e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-year-end">{uiText("ui.to_year_optional_41069a0270")}</Label>
          <Input id="group-year-end" type="number" min={1886} max={2100} value={values.yearEnd ?? ""} onChange={(e) => update("yearEnd", e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="group-region">{uiText("ui.general_area_optional_2f372f095f")}</Label>
          <Input id="group-region" maxLength={80} value={values.locationRegion} onChange={(e) => update("locationRegion", e.target.value)} placeholder={uiText("ui.portland_or_591666d10e")} aria-describedby="group-region-help" />
          <p id="group-region-help" className="text-xs text-muted-foreground">{uiText("ui.city_or_region_only_never_a_street_address_044cbc86e3")}</p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="group-rules">{uiText("ui.rules_one_per_line_up_to_12_5e6aca7657")}</Label>
          <Textarea id="group-rules" rows={4} maxLength={2400} value={rulesText} onChange={(e) => setRulesText(e.target.value)} placeholder={uiText("ui.be_factual_no_sales_spam_16a6c96d01")} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === "edit" && values.joinPolicy === "open"
          ? uiText("ui.switching_to_open_admits_anyone_whose_reques_3aae1e3002")
          : uiText("ui.private_and_unlisted_group_posts_never_appea_348201775d")}
      </p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? uiText("ui.saving_23e39291d6") : mode === "create" ? uiText("ui.create_group_35be9c541d") : uiText("ui.save_settings_7f3a3b1428")}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>{uiText("ui.cancel_19766ed6cc")}</Button>
      </div>
    </form>
  );
}
