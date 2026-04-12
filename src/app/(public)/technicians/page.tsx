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

export const metadata: Metadata = {
  title: "Find a Technician",
};

type PageProps = {
  searchParams: Promise<{
    q?: string;
    cert?: string;
  }>;
};

export default async function TechniciansDirectoryPage({ searchParams }: PageProps) {
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
          tech.certification_level,
          ...(tech.specialties ?? []),
          (tech as { service_area?: string | null }).service_area,
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
        <h1 className="font-heading text-3xl font-bold">
          Technician Directory
        </h1>
        <p className="mt-2 text-muted-foreground">
          Browse certified technicians available for vehicle inspections.
        </p>
      </div>

      {/* Search & Filter Bar */}
      <form action="/technicians" method="GET" className="mb-8 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name, specialty, or area…"
            className="pl-9"
          />
        </div>
        <select
          name="cert"
          defaultValue={cert ?? "all"}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[180px]"
        >
          <option value="all">All certifications</option>
          <option value="ase">ASE Certified</option>
          <option value="master">ASE Master</option>
          <option value="oem_qualified">OEM Qualified</option>
          <option value="none">Uncertified</option>
        </select>
        <Button type="submit">Search</Button>
        {hasFilters && (
          <Button asChild variant="outline" size="icon">
            <Link href="/technicians">
              <X className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </form>

      <p className="text-sm text-muted-foreground mb-4">
        {technicians.length === 0
          ? "No technicians found"
          : `${technicians.length} technician${technicians.length !== 1 ? "s" : ""} found`}
        {hasFilters && " · Filtered"}
      </p>

      {technicians.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-muted-foreground mb-4">
            {hasFilters ? "No technicians match your search." : "No technicians available yet."}
          </p>
          {hasFilters && (
            <Button asChild variant="outline">
              <Link href="/technicians">Clear filters</Link>
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
                        <Badge variant="outline" className="text-xs">
                          <Star className="mr-1 h-3 w-3 text-amber-500" />
                          {Number(tech.avg_rating ?? 0).toFixed(1)} ({tech.total_reviews ?? 0})
                        </Badge>
                        {(tech as { service_area?: string | null }).service_area && (
                          <Badge variant="outline" className="text-xs">
                            <MapPin className="mr-1 h-3 w-3" />
                            {(tech as { service_area?: string | null }).service_area}
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
