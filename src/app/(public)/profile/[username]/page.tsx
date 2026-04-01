import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/features/profiles/queries";
import { getDirectory } from "@/features/technicians/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInitials } from "@/lib/utils/formatting";
import Link from "next/link";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getPublicProfile(username);
  if (!profile) return {};

  return {
    title: `${profile.display_name ?? profile.username} — PerfectPPI`,
    description: profile.bio ?? `View ${profile.display_name ?? profile.username}'s profile on PerfectPPI.`,
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getPublicProfile(username);
  if (!profile) notFound();

  // If this user is a technician, fetch their tech profile for the tech section
  let techEntries: Awaited<ReturnType<typeof getDirectory>> = [];
  if (profile.role === "technician") {
    techEntries = await getDirectory();
    techEntries = techEntries.filter((t) => t.profile_id === profile.id);
  }
  const tech = techEntries[0] ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12 sm:px-6 lg:px-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile.avatar_url ?? ""} />
              <AvatarFallback className="text-lg">
                {getInitials(profile.display_name ?? profile.username ?? "U")}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-2xl">{profile.display_name}</CardTitle>
              {profile.username && (
                <p className="text-muted-foreground">@{profile.username}</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {profile.bio && (
            <p className="text-sm text-muted-foreground">{profile.bio}</p>
          )}
        </CardContent>
      </Card>

      {tech && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Technician Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge>{tech.certification_level}</Badge>
              <Badge variant="outline">{tech.total_inspections} inspections</Badge>
              {tech.organization && (
                <Badge variant="secondary">{tech.organization.name}</Badge>
              )}
            </div>
            {tech.specialties && tech.specialties.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tech.specialties.map((s: string) => (
                  <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                ))}
              </div>
            )}
            <Link
              href={`/technicians/${tech.id}`}
              className="inline-block text-sm text-accent hover:underline"
            >
              View full technician profile →
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
