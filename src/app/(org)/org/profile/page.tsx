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

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type TechProfile = Database["public"]["Tables"]["technician_profiles"]["Row"];
type Organization = Database["public"]["Tables"]["organizations"]["Row"];

export default function OrgProfilePage() {
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

    setProfileMessage("Profile updated.");
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

    setOrgMessage("Organization updated.");
    setOrgSaving(false);
    await fetchData();
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">Organization Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>Manager Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleProfileSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                name="display_name"
                defaultValue={profile?.display_name ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                defaultValue={profile?.username ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                name="bio"
                rows={4}
                defaultValue={profile?.bio ?? ""}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_public"
                name="is_public"
                value="true"
                defaultChecked={profile?.is_public ?? false}
                className="rounded"
              />
              <Label htmlFor="is_public">Show profile publicly</Label>
            </div>
            {profileMessage && (
              <p className="text-sm text-muted-foreground">{profileMessage}</p>
            )}
            <Button type="submit" disabled={profileSaving}>
              {profileSaving ? "Saving..." : "Save Profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization Branding</CardTitle>
        </CardHeader>
        <CardContent>
          {organization ? (
            <form action={handleOrganizationSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Organization Name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={organization.name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={4}
                  defaultValue={organization.description ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="logo_url">Logo URL</Label>
                <Input
                  id="logo_url"
                  name="logo_url"
                  defaultValue={organization.logo_url ?? ""}
                  placeholder="https://example.com/logo.png"
                />
              </div>
              {techProfile && (
                <p className="text-sm text-muted-foreground">
                  Manager profile linked via technician profile{" "}
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
                {orgSaving ? "Saving..." : "Save Organization"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              No organization is attached to this manager account.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
