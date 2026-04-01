import type { Metadata } from "next";
import { getDirectory } from "@/features/technicians/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/formatting";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Find a Technician",
};

export default async function TechniciansDirectoryPage() {
  const technicians = await getDirectory();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">
          Technician Directory
        </h1>
        <p className="mt-2 text-muted-foreground">
          Browse certified technicians available for vehicle inspections.
        </p>
      </div>

      {technicians.length === 0 ? (
        <p className="text-muted-foreground">
          No technicians available yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {technicians.map((tech) => {
            const profile = tech.profile;
            const org = tech.organization;

            return (
              <Link key={tech.id} href={`/technicians/${tech.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-start gap-4 p-6">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={profile?.avatar_url ?? ""} />
                      <AvatarFallback>
                        {getInitials(profile?.display_name ?? "T")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold">
                        {profile?.display_name ?? "Technician"}
                      </p>
                      {org && (
                        <p className="text-sm text-muted-foreground">
                          {org.name}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {tech.certification_level}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {tech.total_inspections} inspections
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
