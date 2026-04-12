import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTechProfile } from "@/features/technicians/queries";
import { getTechnicianReviewSummary } from "@/features/reviews/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInitials } from "@/lib/utils/formatting";
import Link from "next/link";

const CERT_LABELS: Record<string, string> = {
  none: "Uncertified",
  ase: "ASE Certified",
  master: "ASE Master",
  oem_qualified: "OEM Qualified",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const tech = await getTechProfile(id);
  if (!tech) return {};

  const name = tech.profile?.display_name ?? "Technician";
  return {
    title: `${name} — PerfectPPI Technician`,
    description: tech.profile?.bio ?? `View ${name}'s inspection profile on PerfectPPI.`,
  };
}

export default async function TechnicianProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tech, reviewSummary] = await Promise.all([
    getTechProfile(id),
    getTechnicianReviewSummary(id),
  ]);
  if (!tech) notFound();

  const profile = tech.profile;
  const org = tech.organization;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
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
            <Button asChild>
              <Link href={`/signup?tech=${tech.id}`}>
                Request Inspection
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge>
              {CERT_LABELS[tech.certification_level] ?? tech.certification_level}
            </Badge>
            <Badge variant="outline">
              {tech.total_inspections} inspections completed
            </Badge>
            <Badge variant="outline">
              {Number(reviewSummary?.avgRating ?? 0).toFixed(1)} / 5 ({reviewSummary?.totalReviews ?? 0} reviews)
            </Badge>
            {tech.is_independent && (
              <Badge variant="secondary">Independent</Badge>
            )}
          </div>

          <div>
            <Button variant="outline" asChild>
              <Link href={`/technicians/${tech.id}/reviews`}>
                View Reviews
              </Link>
            </Button>
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
