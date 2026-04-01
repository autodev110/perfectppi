import { notFound } from "next/navigation";
import { getPublicProfile } from "@/features/profiles/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInitials } from "@/lib/utils/formatting";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getPublicProfile(username);

  if (!profile) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
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
              <CardTitle className="text-2xl">
                {profile.display_name}
              </CardTitle>
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
    </div>
  );
}
