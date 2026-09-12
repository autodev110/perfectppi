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

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type TechProfile = Database["public"]["Tables"]["technician_profiles"]["Row"];

export default function AccountSettingsPage() {
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

    setTechMessage("Technician access enabled.");
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

    setOrgMessage("Organization workspace created.");
    setOrgSaving(false);
    await fetchData();
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">Account Settings</h1>

      {profile && (
        <RoleSwitcher
          currentRole={profile.role}
          isDeveloper={profile.is_developer}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">Per-category in-app and push switches.</p>
          <Button asChild variant="outline" size="sm"><Link href="/dashboard/settings/notifications">Manage</Link></Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Your current role is <span className="font-medium text-foreground">{profile?.role ?? "unknown"}</span>.
          </p>
          {profile?.role && profile.role !== "consumer" && (
            <p className="text-sm text-muted-foreground">
              Your main workspace is{" "}
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
            <p className="text-sm text-muted-foreground">
              Your technician profile is ready. Professional credentials are
              submitted and reviewed from the technician profile screen.
            </p>
          )}
        </CardContent>
      </Card>

      {profile?.role === "consumer" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Enable Technician Access</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={handleTechnicianSetup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tech-specialties">
                    Specialties
                  </Label>
                  <Input
                    id="tech-specialties"
                    name="specialties"
                    placeholder="European, EVs, Diagnostics"
                    defaultValue={techProfile?.specialties?.join(", ") ?? ""}
                  />
                  <p className="text-xs text-muted-foreground">
                    Separate specialties with commas.
                  </p>
                </div>
                {techMessage && (
                  <p className="text-sm text-destructive">{techMessage}</p>
                )}
                <Button type="submit" disabled={techSaving}>
                  {techSaving ? "Enabling..." : "Become a Technician"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Create Organization Workspace</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={handleOrganizationSetup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="organization_name">Organization Name</Label>
                  <Input
                    id="organization_name"
                    name="organization_name"
                    placeholder="Autobay Motors"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organization_description">
                    Description
                  </Label>
                  <Textarea
                    id="organization_description"
                    name="organization_description"
                    rows={3}
                    placeholder="Tell customers about your shop."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-specialties">
                    Your Specialties
                  </Label>
                  <Input
                    id="org-specialties"
                    name="specialties"
                    placeholder="Luxury, Imports, Electrical"
                    defaultValue={techProfile?.specialties?.join(", ") ?? ""}
                  />
                </div>
                {orgMessage && (
                  <p className="text-sm text-destructive">{orgMessage}</p>
                )}
                <Button type="submit" disabled={orgSaving}>
                  {orgSaving ? "Creating..." : "Create Organization Access"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}

      {profile?.role === "technician" && (
        <Card>
          <CardHeader>
            <CardTitle>Upgrade to Organization Manager</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={handleOrganizationSetup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="organization_name">Organization Name</Label>
                <Input
                  id="organization_name"
                  name="organization_name"
                  placeholder="Autobay Motors"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization_description">Description</Label>
                <Textarea
                  id="organization_description"
                  name="organization_description"
                  rows={3}
                  placeholder="Tell customers about your organization."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-specialties">Your Specialties</Label>
                <Input
                  id="org-specialties"
                  name="specialties"
                  placeholder="Diagnostics, Performance, EVs"
                  defaultValue={techProfile?.specialties?.join(", ") ?? ""}
                />
              </div>
              {orgMessage && (
                <p className="text-sm text-destructive">{orgMessage}</p>
              )}
              <Button type="submit" disabled={orgSaving}>
                {orgSaving ? "Creating..." : "Create My Organization"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {profile?.role && profile.role !== "consumer" && profile.role !== "admin" && (
        <Card>
          <CardHeader>
            <CardTitle>Switch Back to Consumer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your technician profile and data will be preserved. You can re-enable technician access from this page at any time.
            </p>
            {switchMessage && (
              <p className="text-sm text-destructive">{switchMessage}</p>
            )}
            <Button
              variant="outline"
              disabled={switchSaving}
              onClick={handleSwitchToConsumer}
            >
              {switchSaving ? "Switching..." : "Switch to Consumer"}
            </Button>
          </CardContent>
        </Card>
      )}

      {profile?.role && profile.role !== "consumer" && profile.role !== "technician" && (
        <Card>
          <CardHeader>
            <CardTitle>Workspace Ready</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your access is already provisioned. Continue in your main
              workspace from{" "}
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
