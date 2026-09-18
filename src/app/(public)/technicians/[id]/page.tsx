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
import { TechnicianCredentialFacts } from "@/components/shared/technician-credential-facts";

import { getRequestTranslator } from "@/lib/i18n/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const uiText = await getRequestTranslator();
  const { id } = await params;
  const tech = await getTechProfile(id);
  if (!tech) return {};

  const name = tech.profile?.display_name ?? uiText("ui.technician_9041ccc417");
  return {
    title: uiText("ui.perfectppi_technician_e31c39618b", { arg0: String(name) }),
    description: tech.profile?.bio ?? uiText("ui.view_s_inspection_profile_on_perfectppi_919a14cb43", { arg0: String(name) }),
  };
}

export default async function TechnicianProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const uiText = await getRequestTranslator();
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
                  {getInitials(profile?.display_name ?? uiText("ui.t_e632b7095b"))}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-2xl">
                  {profile?.display_name ?? uiText("ui.technician_9041ccc417")}
                </CardTitle>
                {org && (
                  <p className="text-muted-foreground">{org.name}</p>
                )}
              </div>
            </div>
            <Button asChild>
              <Link href={`/signup?tech=${tech.id}`}>{uiText("ui.request_inspection_7ad098f214")}</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {tech.total_inspections}{uiText("ui.inspections_completed_7e06de06ec")}</Badge>
            <Badge variant="outline">
              {Number(reviewSummary?.avgRating ?? 0).toFixed(1)} / 5 ({reviewSummary?.totalReviews ?? 0}{uiText("ui.reviews_5c6be8630f")}</Badge>
            {tech.is_independent && (
              <Badge variant="secondary">{uiText("ui.independent_6cbf0605ed")}</Badge>
            )}
          </div>

          <div>
            <h3 className="mb-2 font-semibold">{uiText("ui.reviewed_credentials_d2ba84c688")}</h3>
            <TechnicianCredentialFacts credentials={tech.credentials} />
          </div>

          <div>
            <Button variant="outline" asChild>
              <Link href={`/technicians/${tech.id}/reviews`}>{uiText("ui.view_reviews_dead5662c3")}</Link>
            </Button>
          </div>

          {profile?.bio && (
            <div>
              <h3 className="mb-1 font-semibold">{uiText("ui.about_4efca0d10c")}</h3>
              <p className="text-sm text-muted-foreground">{profile.bio}</p>
            </div>
          )}

          {tech.specialties && tech.specialties.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold">{uiText("ui.specialties_89440c3f3b")}</h3>
              <div className="flex flex-wrap gap-1">
                {tech.specialties.map((s: string) => (
                  <Badge key={s} variant="outline" className="text-xs">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {tech.supported_makes.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold">{uiText("ui.supported_makes_d85f1210c7")}</h3>
              <div className="flex flex-wrap gap-1">
                {tech.supported_makes.map((make) => (
                  <Badge key={make} variant="outline" className="text-xs">{make}</Badge>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 font-semibold">{uiText("ui.service_details_6e39033860")}</h3>
            <p className="text-sm text-muted-foreground">
              {tech.service_area ?? uiText("ui.service_area_not_provided_69f2206560")}
              {tech.offers_mobile_service ? uiText("ui.mobile_service_3f4ca65d69") : ""}
              {tech.offers_shop_service ? uiText("ui.shop_service_9289fefe79") : ""}
              {tech.is_available ? uiText("ui.accepting_inspection_requests_9c33964af5") : uiText("ui.availability_not_confirmed_c82513baf6")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
