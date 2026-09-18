import type { Metadata } from "next";
import { getDirectory } from "@/features/technicians/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getInitials } from "@/lib/utils/formatting";
import Link from "next/link";
import { MapPin, Search, Star, X } from "lucide-react";
import { TechnicianCredentialFacts } from "@/components/shared/technician-credential-facts";
import { credentialTypeLabel } from "@/features/technicians/credential-types";
import { t as uiText } from "@/lib/i18n";
import { getRequestTranslator } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: uiText("ui.find_a_technician_8f8aff766b"),
};

type PageProps = {
  searchParams: Promise<{
    q?: string;
    cert?: string;
  }>;
};

export default async function TechniciansDirectoryPage({ searchParams }: PageProps) {
  const uiText = await getRequestTranslator();
  const { q, cert } = await searchParams;

  const allTechnicians = await getDirectory({
    certification: cert && cert !== "all" ? cert : undefined,
  });

  // Client-side name/specialty text filter
  const normalized = q?.trim().toLowerCase();
  const technicians = normalized
    ? allTechnicians.filter((tech) => {
        const profile = tech.profile as { display_name: string | null; username: string | null } | null;
        const haystack = [
          profile?.display_name,
          profile?.username,
          ...(tech.specialties ?? []),
          ...(tech.supported_makes ?? []),
          ...tech.credentials.flatMap((credential) => [
            credentialTypeLabel(credential.credential_type),
            credential.credential_name,
            credential.issuer,
            credential.scope,
          ]),
          tech.service_area,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalized);
      })
    : allTechnicians;

  const hasFilters = !!(q || (cert && cert !== "all"));

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">{uiText("ui.technician_directory_5143ce2890")}</h1>
        <p className="mt-2 text-muted-foreground">{uiText("ui.browse_technician_profiles_service_details_a_07c498900f")}</p>
      </div>

      {/* Search & Filter Bar */}
      <form action="/technicians" method="GET" className="mb-8 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label={uiText("ui.search_technicians_95dec95047")}
            name="q"
            defaultValue={q ?? ""}
            placeholder={uiText("ui.search_by_name_specialty_or_area_11f97f9c20")}
            className="pl-9"
          />
        </div>
        <select
          aria-label={uiText("ui.filter_by_reviewed_credential_e063e49e18")}
          name="cert"
          defaultValue={cert ?? "all"}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[180px]"
        >
          <option value="all">{uiText("ui.all_credential_statuses_e37a983c16")}</option>
          <option value="ase">{uiText("ui.reviewed_ase_credential_25cd09ebfd")}</option>
          <option value="master">{uiText("ui.reviewed_ase_master_credential_064e6596e5")}</option>
          <option value="oem_qualified">{uiText("ui.reviewed_oem_training_credential_cad69c7bdf")}</option>
          <option value="none">{uiText("ui.no_reviewed_credential_01e61be243")}</option>
        </select>
        <Button type="submit">{uiText("ui.search_49c266baaa")}</Button>
        {hasFilters && (
          <Button asChild variant="outline" size="icon">
            <Link href="/technicians" aria-label={uiText("ui.clear_technician_filters_f32ff8055a")}>
              <X className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </form>

      <p className="text-sm text-muted-foreground mb-4">
        {technicians.length === 0
          ? uiText("ui.no_technicians_found_af9864a2d8")
          : uiText("ui.technician_found_9a131b9438", { arg0: String(technicians.length), arg1: String(technicians.length !== 1 ? "s" : "") })}
        {hasFilters && " · Filtered"}
      </p>

      {technicians.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-muted-foreground mb-4">
            {hasFilters ? uiText("ui.no_technicians_match_your_search_88971f327b") : uiText("ui.no_technicians_available_yet_d34a4fbf0a")}
          </p>
          {hasFilters && (
            <Button asChild variant="outline">
              <Link href="/technicians">{uiText("ui.clear_filters_7179ea0035")}</Link>
            </Button>
          )}
        </div>
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
                        {getInitials(profile?.display_name ?? uiText("ui.t_e632b7095b"))}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold">
                        {profile?.display_name ?? uiText("ui.technician_9041ccc417")}
                      </p>
                      {org && (
                        <p className="text-sm text-muted-foreground">
                          {org.name}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <TechnicianCredentialFacts credentials={tech.credentials} compact />
                        <Badge variant="outline" className="text-xs">
                          {tech.total_inspections}{uiText("ui.inspections_72d3585c34")}</Badge>
                        <Badge variant="outline" className="text-xs">
                          <Star className="mr-1 h-3 w-3 text-amber-500" />
                          {Number(tech.avg_rating ?? 0).toFixed(1)} ({tech.total_reviews ?? 0})
                        </Badge>
                        {tech.service_area && (
                          <Badge variant="outline" className="text-xs">
                            <MapPin className="mr-1 h-3 w-3" />
                            {tech.service_area}
                          </Badge>
                        )}
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
