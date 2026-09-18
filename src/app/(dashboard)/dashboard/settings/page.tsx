"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createOrganizationWorkspace,
  enableTechnicianAccess,
  switchToConsumer,
} from "@/features/profiles/actions";
import { getRoleHomePath } from "@/features/auth/routing";
import { createClient } from "@/lib/supabase/client";
import { RoleSwitcher } from "@/components/dev/role-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/types/database";
import { PrivacyCenter } from "@/components/legal/privacy-center";

import { useTranslator } from "@/lib/i18n/client";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type TechProfile = Database["public"]["Tables"]["technician_profiles"]["Row"];

export default function AccountSettingsPage() {
  const uiText = useTranslator();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [techProfile, setTechProfile] = useState<TechProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [techSaving, setTechSaving] = useState(false);
  const [orgSaving, setOrgSaving] = useState(false);
  const [switchSaving, setSwitchSaving] = useState(false);
  const [techMessage, setTechMessage] = useState<string | null>(null);
  const [orgMessage, setOrgMessage] = useState<string | null>(null);
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
    }

    setLoading(false);
  }

  useEffect(() => {
    void fetchData();
  }, []);

  async function handleTechnicianSetup(formData: FormData) {
    setTechSaving(true);
    setTechMessage(null);

    const result = await enableTechnicianAccess(formData);

    if (result?.error) {
      setTechMessage(result.error);
      setTechSaving(false);
      return;
    }

    if (result?.redirectTo) {
      window.location.href = result.redirectTo;
      return;
    }

    setTechMessage(uiText("ui.technician_access_enabled_73d0ad7867"));
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
      return;
    }

    setSwitchSaving(false);
    await fetchData();
  }

  async function handleOrganizationSetup(formData: FormData) {
    setOrgSaving(true);
    setOrgMessage(null);

    const result = await createOrganizationWorkspace(formData);

    if (result?.error) {
      setOrgMessage(result.error);
      setOrgSaving(false);
      return;
    }

    if (result?.redirectTo) {
      window.location.href = result.redirectTo;
      return;
    }

    setOrgMessage(uiText("ui.organization_workspace_created_38820c8e48"));
    setOrgSaving(false);
    await fetchData();
  }

  if (loading) {
    return <p className="text-muted-foreground">{uiText("ui.loading_47d2a515ef")}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">{uiText("ui.account_settings_d0f9bc7a3b")}</h1>

      {profile && (
        <RoleSwitcher
          currentRole={profile.role}
          isDeveloper={profile.is_developer}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{uiText("ui.notifications_788011833a")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">{uiText("ui.per_category_in_app_and_push_switches_b530a61b8d")}</p>
          <Button asChild variant="outline" size="sm"><Link href="/dashboard/settings/notifications">{uiText("ui.manage_5a23444828")}</Link></Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{uiText("ui.current_access_7afa588e5a")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{uiText("ui.your_current_role_is_a3a91f2485")}<span className="font-medium text-foreground">{profile?.role ?? uiText("ui.unknown_b23a6a8439")}</span>.
          </p>
          {profile?.role && profile.role !== "consumer" && (
            <p className="text-sm text-muted-foreground">{uiText("ui.your_main_workspace_is_3f6bec2725")}{" "}
              <Link
                href={getRoleHomePath(profile.role)}
                className="font-medium text-accent underline"
              >
                {getRoleHomePath(profile.role)}
              </Link>
              .
            </p>
          )}
          {techProfile && (
            <p className="text-sm text-muted-foreground">{uiText("ui.your_technician_profile_is_ready_professiona_8c32034df2")}</p>
          )}
        </CardContent>
      </Card>

      {profile?.role === "consumer" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{uiText("ui.enable_technician_access_91248de224")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={handleTechnicianSetup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tech-specialties">{uiText("ui.specialties_89440c3f3b")}</Label>
                  <Input
                    id="tech-specialties"
                    name="specialties"
                    placeholder={uiText("ui.european_evs_diagnostics_f9e98f5c1c")}
                    defaultValue={techProfile?.specialties?.join(", ") ?? ""}
                  />
                  <p className="text-xs text-muted-foreground">{uiText("ui.separate_specialties_with_commas_51d2c55590")}</p>
                </div>
                {techMessage && (
                  <p className="text-sm text-destructive">{techMessage}</p>
                )}
                <Button type="submit" disabled={techSaving}>
                  {techSaving ? uiText("ui.enabling_3ad3137c21") : uiText("ui.become_a_technician_655b3a657b")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{uiText("ui.create_organization_workspace_a57d111847")}</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={handleOrganizationSetup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="organization_name">{uiText("ui.organization_name_4cbd907324")}</Label>
                  <Input
                    id="organization_name"
                    name="organization_name"
                    placeholder={uiText("ui.autobay_motors_01dd695055")}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organization_description">{uiText("ui.description_526e0087cc")}</Label>
                  <Textarea
                    id="organization_description"
                    name="organization_description"
                    rows={3}
                    placeholder={uiText("ui.tell_customers_about_your_shop_73ada72490")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-specialties">{uiText("ui.your_specialties_e73a205850")}</Label>
                  <Input
                    id="org-specialties"
                    name="specialties"
                    placeholder={uiText("ui.luxury_imports_electrical_48ef21299d")}
                    defaultValue={techProfile?.specialties?.join(", ") ?? ""}
                  />
                </div>
                {orgMessage && (
                  <p className="text-sm text-destructive">{orgMessage}</p>
                )}
                <Button type="submit" disabled={orgSaving}>
                  {orgSaving ? uiText("ui.creating_def70944c9") : uiText("ui.create_organization_access_040b973532")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}

      {profile?.role === "technician" && (
        <Card>
          <CardHeader>
            <CardTitle>{uiText("ui.upgrade_to_organization_manager_435fd95511")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleOrganizationSetup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="organization_name">{uiText("ui.organization_name_4cbd907324")}</Label>
                <Input
                  id="organization_name"
                  name="organization_name"
                  placeholder={uiText("ui.autobay_motors_01dd695055")}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization_description">{uiText("ui.description_526e0087cc")}</Label>
                <Textarea
                  id="organization_description"
                  name="organization_description"
                  rows={3}
                  placeholder={uiText("ui.tell_customers_about_your_organization_f163a36180")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-specialties">{uiText("ui.your_specialties_e73a205850")}</Label>
                <Input
                  id="org-specialties"
                  name="specialties"
                  placeholder={uiText("ui.diagnostics_performance_evs_7770f8b411")}
                  defaultValue={techProfile?.specialties?.join(", ") ?? ""}
                />
              </div>
              {orgMessage && (
                <p className="text-sm text-destructive">{orgMessage}</p>
              )}
              <Button type="submit" disabled={orgSaving}>
                {orgSaving ? uiText("ui.creating_def70944c9") : uiText("ui.create_my_organization_50d33e09a4")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {profile?.role && profile.role !== "consumer" && profile.role !== "admin" && (
        <Card>
          <CardHeader>
            <CardTitle>{uiText("ui.switch_back_to_consumer_6451a466a3")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{uiText("ui.your_technician_profile_and_data_will_be_pre_74257e8f5c")}</p>
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
      )}

      {profile?.role && profile.role !== "consumer" && profile.role !== "technician" && (
        <Card>
          <CardHeader>
            <CardTitle>{uiText("ui.workspace_ready_9e7fe73e14")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{uiText("ui.your_access_is_already_provisioned_continue__0ad110b3f4")}{" "}
              <Link
                href={getRoleHomePath(profile.role)}
                className="font-medium text-accent underline"
              >
                {getRoleHomePath(profile.role)}
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}
      <PrivacyCenter />
    </div>
  );
}
