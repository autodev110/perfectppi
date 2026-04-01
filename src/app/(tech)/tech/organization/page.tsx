import { getMyTechProfile } from "@/features/technicians/queries";
import { getOrgTechnicians } from "@/features/organizations/queries";
import { leaveTechOrganization } from "@/features/organizations/invite-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building2, Users } from "lucide-react";
import { getInitials } from "@/lib/utils/formatting";
import { redirect } from "next/navigation";

export default async function TechOrganizationPage() {
  const techProfile = await getMyTechProfile();
  if (!techProfile) redirect("/login");

  const org = techProfile.organization;

  if (!org) {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold">Organization</h1>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">You are an independent technician</p>
              <p className="text-sm text-muted-foreground">
                You are not affiliated with any organization. Organization managers can invite you through the technician directory.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const teammates = await getOrgTechnicians(org.id);

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Organization</h1>

      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          {org.logo_url && (
            <img src={org.logo_url} alt={org.name} className="h-10 w-10 rounded-lg object-cover" />
          )}
          <div>
            <CardTitle>{org.name}</CardTitle>
            <p className="text-sm text-muted-foreground">/{org.slug}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {teammates.length} team member{teammates.length !== 1 ? "s" : ""}
            </span>
          </div>

          {teammates.length > 0 && (
            <div className="divide-y rounded-lg border">
              {teammates.map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={t.profile?.avatar_url ?? ""} />
                    <AvatarFallback className="text-xs">
                      {getInitials(t.profile?.display_name ?? "T")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{t.profile?.display_name ?? "—"}</p>
                    <Badge variant="outline" className="text-xs">{t.certification_level}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form action={leaveTechOrganization}>
            <Button type="submit" variant="outline" className="text-destructive hover:text-destructive">
              Leave Organization
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
