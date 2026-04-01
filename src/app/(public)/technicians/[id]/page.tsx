import { notFound } from "next/navigation";
import { getTechProfile } from "@/features/technicians/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInitials } from "@/lib/utils/formatting";

export default async function TechnicianProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // id here is technician_profiles.id — we need to look up by that
  // For now, we treat it as profile_id for the public profile lookup
  const tech = await getTechProfile(id);
  if (!tech) notFound();

  const profile = tech.profile;
  const org = tech.organization;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile?.avatar_url ?? ""} />
              <AvatarFallback className="text-lg">
                {getInitials(profile?.display_name ?? "T")}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-2xl">
                {profile?.display_name ?? "Technician"}
              </CardTitle>
              {org && (
                <p className="text-muted-foreground">{org.name}</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge>{tech.certification_level}</Badge>
            <Badge variant="outline">
              {tech.total_inspections} inspections completed
            </Badge>
            {tech.is_independent && (
              <Badge variant="secondary">Independent</Badge>
            )}
          </div>

          {profile?.bio && (
            <div>
              <h3 className="mb-1 font-semibold">About</h3>
              <p className="text-sm text-muted-foreground">{profile.bio}</p>
            </div>
          )}

          {tech.specialties && tech.specialties.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold">Specialties</h3>
              <div className="flex flex-wrap gap-1">
                {tech.specialties.map((s: string) => (
                  <Badge key={s} variant="outline" className="text-xs">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
