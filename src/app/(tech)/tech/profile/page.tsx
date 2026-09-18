"use client";

import { useEffect, useState } from "react";
import { updateProfile, switchToConsumer } from "@/features/profiles/actions";
import { updateTechProfile } from "@/features/technicians/actions";
import { createClient } from "@/lib/supabase/client";
import { RoleSwitcher } from "@/components/dev/role-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/types/database";
import { PrivacyCenter } from "@/components/legal/privacy-center";
import { SocialPrivacyFields } from "@/components/shared/social-privacy-fields";
import { SafetyRelationships } from "@/components/shared/safety-relationships";
import { TechnicianCredentialManager } from "@/components/shared/technician-credential-manager";

import { useTranslator } from "@/lib/i18n/client";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type TechProfile = Database["public"]["Tables"]["technician_profiles"]["Row"];
type Organization = Database["public"]["Tables"]["organizations"]["Row"];

export default function TechProfilePage() {
  const uiText = useTranslator();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [techProfile, setTechProfile] = useState<TechProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [techSaving, setTechSaving] = useState(false);
  const [switchSaving, setSwitchSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [techMessage, setTechMessage] = useState<string | null>(null);
  const [switchMessage, setSwitchMessage] = useState<string | null>(null);

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

  async function handleTechSubmit(formData: FormData) {
    setTechSaving(true);
    setTechMessage(null);

    const result = await updateTechProfile(formData);

    if (result?.error) {
      setTechMessage(result.error);
      setTechSaving(false);
      return;
    }

    setTechMessage(uiText("ui.technician_profile_updated_f824367ef1"));
    setTechSaving(false);
    await fetchData();
  }

  async function handleSwitchToConsumer() {
    setSwitchSaving(true);
    setSwitchMessage(null);
    const result = await switchToConsumer();
    if (result?.error) {
      setSwitchMessage(result.error);
      setSwitchSaving(false);
      return;
    }
    if (result?.redirectTo) {
      window.location.href = result.redirectTo;
    }
  }

  if (loading) {
    return <p className="text-muted-foreground">{uiText("ui.loading_47d2a515ef")}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">{uiText("ui.technician_profile_983bd01445")}</h1>

      {profile && (
        <RoleSwitcher
          currentRole={profile.role}
          isDeveloper={profile.is_developer}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{uiText("ui.public_profile_6f3c838c26")}</CardTitle>
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
        <CardHeader>
          <CardTitle>{uiText("ui.technician_details_dce96fa68f")}</CardTitle>
        </CardHeader>
        <CardContent>
          {techProfile ? (
            <form action={handleTechSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="specialties">{uiText("ui.specialties_89440c3f3b")}</Label>
                <Input
                  id="specialties"
                  name="specialties"
                  defaultValue={techProfile.specialties?.join(", ") ?? ""}
                  placeholder={uiText("ui.diagnostics_imports_evs_a06f14cf33")}
                />
                <p className="text-xs text-muted-foreground">{uiText("ui.separate_specialties_with_commas_51d2c55590")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="supported_makes">{uiText("ui.supported_makes_7a111f8f89")}</Label>
                <Input
                  id="supported_makes"
                  name="supported_makes"
                  defaultValue={techProfile.supported_makes.join(", ")}
                  placeholder={uiText("ui.honda_toyota_ford_3bcd974a8c")}
                />
                <p className="text-xs text-muted-foreground">{uiText("ui.separate_makes_with_commas_b85374ddac")}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_independent"
                  name="is_independent"
                  value="true"
                  defaultChecked={techProfile.is_independent}
                  className="rounded"
                  disabled={Boolean(organization)}
                />
                <Label htmlFor="is_independent">{uiText("ui.independent_technician_b16d3da1e9")}</Label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="offers_mobile_service"
                    name="offers_mobile_service"
                    value="true"
                    defaultChecked={techProfile.offers_mobile_service}
                    className="rounded"
                  />
                  <Label htmlFor="offers_mobile_service">{uiText("ui.offers_mobile_service_7424a0763c")}</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="offers_shop_service"
                    name="offers_shop_service"
                    value="true"
                    defaultChecked={techProfile.offers_shop_service}
                    className="rounded"
                  />
                  <Label htmlFor="offers_shop_service">{uiText("ui.offers_shop_service_6372e27a72")}</Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="service_area">{uiText("ui.service_area_ba44ee1db7")}</Label>
                <Input
                  id="service_area"
                  name="service_area"
                  defaultValue={techProfile.service_area ?? ""}
                  placeholder={uiText("ui.e_g_dallas_fort_worth_tx_97c21d0114")}
                />
                <p className="text-xs text-muted-foreground">{uiText("ui.city_metro_area_or_region_where_you_perform__ff5e7b98fa")}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_available"
                  name="is_available"
                  value="true"
                  defaultChecked={techProfile.is_available}
                  className="rounded"
                />
                <Label htmlFor="is_available">{uiText("ui.available_for_new_inspections_6266480d26")}</Label>
              </div>
              {organization && (
                <p className="text-sm text-muted-foreground">{uiText("ui.affiliated_organization_0d27af52f5")}{" "}
                  <span className="font-medium text-foreground">
                    {organization.name}
                  </span>
                </p>
              )}
              {techMessage && (
                <p className="text-sm text-muted-foreground">{techMessage}</p>
              )}
              <Button type="submit" disabled={techSaving}>
                {techSaving ? uiText("ui.saving_dc85af8f2b") : uiText("ui.save_technician_details_1740360f40")}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">{uiText("ui.technician_profile_not_found_for_this_accoun_7e2fb1bfde")}</p>
          )}
        </CardContent>
      </Card>
      {techProfile && (
        <Card>
          <CardHeader>
            <CardTitle>{uiText("ui.professional_credentials_625039847b")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TechnicianCredentialManager />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{uiText("ui.switch_back_to_consumer_6451a466a3")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{uiText("ui.your_technician_profile_and_inspection_histo_956eb9319b")}</p>
          {switchMessage && (
            <p className="text-sm text-destructive">{switchMessage}</p>
          )}
          <Button
            variant="outline"
            disabled={switchSaving}
            onClick={handleSwitchToConsumer}
          >
            {switchSaving ? uiText("ui.switching_e367dfd91c") : uiText("ui.switch_to_consumer_54d771d0c9")}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{uiText("ui.privacy_safety_f096950eac")}</CardTitle></CardHeader>
        <CardContent><SafetyRelationships /></CardContent>
      </Card>
      <PrivacyCenter />
    </div>
  );
}
