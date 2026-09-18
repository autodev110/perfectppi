"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { updateProfile } from "@/features/profiles/actions";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, Eye } from "lucide-react";
import type { Database } from "@/types/database";
import { SocialPrivacyFields } from "@/components/shared/social-privacy-fields";
import { SafetyRelationships } from "@/components/shared/safety-relationships";

import { useTranslator } from "@/lib/i18n/client";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default function ProfilePage() {
  const uiText = useTranslator();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("auth_user_id", user.id)
        .single();

      setProfile(data);
      setLoading(false);
    };
    fetchProfile();
  }, []);

  async function handleSubmit(formData: FormData) {
    setSaving(true);
    setMessage(null);
    const result = await updateProfile(formData);
    if (result?.error) {
      setMessage(result.error);
    } else {
      setMessage(uiText("ui.profile_updated_3a06720a52"));
    }
    setSaving(false);
  }

  if (loading) {
    return <p className="text-muted-foreground">{uiText("ui.loading_47d2a515ef")}</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.edit_profile_fec2ac0f4c")}</h1>
        {profile?.username && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/profile/preview">
                <Eye className="mr-2 h-3.5 w-3.5" />{uiText("ui.view_as_stranger_78ae0f21fb")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/profile/${profile.username}`} target="_blank">
                <ExternalLink className="mr-2 h-3.5 w-3.5" />{uiText("ui.view_my_profile_5f6941424f")}</Link>
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{uiText("ui.profile_details_65f1ee4298")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="display_name">{uiText("ui.display_name_18d67c992b")}</Label>
              <Input
                id="display_name"
                name="display_name"
                defaultValue={profile?.display_name ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label>{uiText("ui.username_e3b89e9d33")}</Label>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                @{profile?.username}
              </div>
              <p className="text-xs text-muted-foreground">{uiText("ui.usernames_cannot_be_changed_yet_a580056e04")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">{uiText("ui.bio_3933b18021")}</Label>
              <Textarea
                id="bio"
                name="bio"
                defaultValue={profile?.bio ?? ""}
                rows={3}
                placeholder={uiText("ui.tell_us_about_yourself_697f10251d")}
              />
            </div>
            <SocialPrivacyFields profile={profile} />
            {message && (
              <p
                className={`text-sm ${message.includes("error") || message.includes("taken") ? "text-destructive" : "text-teal"}`}
              >
                {message}
              </p>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? uiText("ui.saving_dc85af8f2b") : uiText("ui.save_changes_35322b5bb5")}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{uiText("ui.privacy_safety_f096950eac")}</CardTitle></CardHeader>
        <CardContent><SafetyRelationships /></CardContent>
      </Card>
    </div>
  );
}
