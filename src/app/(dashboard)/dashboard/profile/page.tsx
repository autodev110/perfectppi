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
import { ExternalLink } from "lucide-react";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default function ProfilePage() {
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
      setMessage("Profile updated.");
    }
    setSaving(false);
  }

  if (loading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-heading text-2xl font-bold">Edit Profile</h1>
        {profile?.is_public && profile?.username && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/profile/${profile.username}`} target="_blank">
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              View Public Profile
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
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
                placeholder="unique-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                name="bio"
                defaultValue={profile?.bio ?? ""}
                rows={3}
                placeholder="Tell us about yourself..."
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
              <Label htmlFor="is_public">Make profile public</Label>
            </div>
            {message && (
              <p
                className={`text-sm ${message.includes("error") || message.includes("taken") ? "text-destructive" : "text-teal"}`}
              >
                {message}
              </p>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
