"use client";

import { useEffect, useState } from "react";
import { updateProfile } from "@/features/profiles/actions";
import { updateOrg } from "@/features/organizations/actions";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/types/database";
import { SocialPrivacyFields } from "@/components/shared/social-privacy-fields";
import { SafetyRelationships } from "@/components/shared/safety-relationships";

import { useTranslator } from "@/lib/i18n/client";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type TechProfile = Database["public"]["Tables"]["technician_profiles"]["Row"];
type Organization = Database["public"]["Tables"]["organizations"]["Row"];

export default function OrgProfilePage() {
  const uiText = useTranslator();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [techProfile, setTechProfile] = useState<TechProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [orgSaving, setOrgSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [orgMessage, setOrgMessage] = useState<string | null>(null);

  async function fetchData() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("auth_user_id", user.id)
      .single();

    setProfile(currentProfile);

    if (currentProfile) {
      const { data: currentTechProfile } = await supabase
        .from("technician_profiles")
        .select("*")
        .eq("profile_id", currentProfile.id)
        .maybeSingle();

      setTechProfile(currentTechProfile);

      if (currentTechProfile?.organization_id) {
        const { data: currentOrganization } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", currentTechProfile.organization_id)
          .single();

        setOrganization(currentOrganization);
      } else {
        setOrganization(null);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    void fetchData();
  }, []);

  async function handleProfileSubmit(formData: FormData) {
    setProfileSaving(true);
    setProfileMessage(null);

    const result = await updateProfile(formData);

    if (result?.error) {
      setProfileMessage(result.error);
      setProfileSaving(false);
      return;
    }

    setProfileMessage(uiText("ui.profile_updated_3a06720a52"));
    setProfileSaving(false);
    await fetchData();
  }

  async function handleOrganizationSubmit(formData: FormData) {
    setOrgSaving(true);
    setOrgMessage(null);

    const result = await updateOrg(formData);

    if (result?.error) {
      setOrgMessage(result.error);
      setOrgSaving(false);
      return;
    }

    setOrgMessage(uiText("ui.organization_updated_86eb8ecc0d"));
    setOrgSaving(false);
    await fetchData();
  }

  if (loading) {
    return <p className="text-muted-foreground">{uiText("ui.loading_47d2a515ef")}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">{uiText("ui.organization_profile_8f4e0ebdaf")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{uiText("ui.manager_profile_06614e784b")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleProfileSubmit} className="space-y-4">
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
              <div className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
                {profile?.username ? uiText("ui.text_d513a96df3", { arg0: String(profile.username) }) : uiText("ui.not_assigned_13075c2336")}
              </div>
              <p className="text-xs text-muted-foreground">{uiText("ui.usernames_cannot_be_changed_yet_a580056e04")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">{uiText("ui.bio_3933b18021")}</Label>
              <Textarea
                id="bio"
                name="bio"
                rows={4}
                defaultValue={profile?.bio ?? ""}
              />
            </div>
            <SocialPrivacyFields profile={profile} />
            {profileMessage && (
              <p className="text-sm text-muted-foreground">{profileMessage}</p>
            )}
            <Button type="submit" disabled={profileSaving}>
              {profileSaving ? uiText("ui.saving_dc85af8f2b") : uiText("ui.save_profile_a4212f1e2f")}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{uiText("ui.privacy_safety_f096950eac")}</CardTitle></CardHeader>
        <CardContent><SafetyRelationships /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{uiText("ui.organization_branding_76fb6a9582")}</CardTitle>
        </CardHeader>
        <CardContent>
          {organization ? (
            <form action={handleOrganizationSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{uiText("ui.organization_name_4cbd907324")}</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={organization.name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{uiText("ui.description_526e0087cc")}</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={4}
                  defaultValue={organization.description ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="logo_url">{uiText("ui.logo_url_7ed9aaaedf")}</Label>
                <Input
                  id="logo_url"
                  name="logo_url"
                  defaultValue={organization.logo_url ?? ""}
                  placeholder="https://example.com/logo.png"
                />
              </div>
              {techProfile && (
                <p className="text-sm text-muted-foreground">{uiText("ui.manager_profile_linked_via_technician_profil_0235fa8b77")}{" "}
                  <span className="font-medium text-foreground">
                    {techProfile.id}
                  </span>
                  .
                </p>
              )}
              {orgMessage && (
                <p className="text-sm text-muted-foreground">{orgMessage}</p>
              )}
              <Button type="submit" disabled={orgSaving}>
                {orgSaving ? uiText("ui.saving_dc85af8f2b") : uiText("ui.save_organization_b4f30a3f1c")}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">{uiText("ui.no_organization_is_attached_to_this_manager__ced6196e5d")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
