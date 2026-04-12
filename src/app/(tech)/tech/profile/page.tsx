"use client";

import { useEffect, useState } from "react";
import { updateProfile, switchToConsumer } from "@/features/profiles/actions";
import { updateTechProfile } from "@/features/technicians/actions";
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

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm";

export default function TechProfilePage() {
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

    setProfileMessage("Profile updated.");
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

    setTechMessage("Technician profile updated.");
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
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-heading text-2xl font-bold">Technician Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>Public Profile</CardTitle>
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
          <CardTitle>Technician Details</CardTitle>
        </CardHeader>
        <CardContent>
          {techProfile ? (
            <form action={handleTechSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="certification_level">Certification Level</Label>
                <select
                  id="certification_level"
                  name="certification_level"
                  className={selectClassName}
                  defaultValue={techProfile.certification_level}
                >
                  <option value="none">None</option>
                  <option value="ase">ASE</option>
                  <option value="master">Master</option>
                  <option value="oem_qualified">OEM Qualified</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialties">Specialties</Label>
                <Input
                  id="specialties"
                  name="specialties"
                  defaultValue={techProfile.specialties.join(", ")}
                  placeholder="Diagnostics, Imports, EVs"
                />
                <p className="text-xs text-muted-foreground">
                  Separate specialties with commas.
                </p>
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
                <Label htmlFor="is_independent">
                  Independent technician
                </Label>
              </div>
              {organization && (
                <p className="text-sm text-muted-foreground">
                  Affiliated organization:{" "}
                  <span className="font-medium text-foreground">
                    {organization.name}
                  </span>
                </p>
              )}
              {techMessage && (
                <p className="text-sm text-muted-foreground">{techMessage}</p>
              )}
              <Button type="submit" disabled={techSaving}>
                {techSaving ? "Saving..." : "Save Technician Details"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Technician profile not found for this account.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Switch Back to Consumer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Your technician profile and inspection history will be preserved. You can re-enable technician access from your account settings at any time.
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
    </div>
  );
}
