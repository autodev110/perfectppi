import { getMyOrg, getOrgTechnicians } from "@/features/organizations/queries";
import { removeTechnicianFromOrg } from "@/features/organizations/invite-actions";
import { requireRole } from "@/features/auth/guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils/formatting";
import { redirect } from "next/navigation";
import { InviteTechnicianForm } from "./invite-technician-form";

const CERT_LABELS: Record<string, string> = {
  none: "Uncertified",
  ase: "ASE",
  master: "ASE Master",
  oem_qualified: "OEM Qualified",
};

export default async function ManageTechniciansPage() {
  const currentProfile = await requireRole(["org_manager"]);

  const org = await getMyOrg();
  if (!org) redirect("/login");

  const technicians = await getOrgTechnicians(org.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold">Manage Technicians</h1>
        <p className="text-muted-foreground">
          {technicians.length} technician{technicians.length !== 1 ? "s" : ""} in {org.name}
        </p>
      </div>

      {/* Current roster */}
      {technicians.length > 0 ? (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Technician</th>
                <th className="px-4 py-3 text-left font-medium">Certification</th>
                <th className="px-4 py-3 text-left font-medium">Inspections</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {technicians.map((tech) => {
                const profile = tech.profile;
                const isCurrentManager = tech.profile_id === currentProfile.id;
                return (
                  <tr key={tech.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={profile?.avatar_url ?? ""} />
                          <AvatarFallback className="text-xs">
                            {getInitials(profile?.display_name ?? "T")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{profile?.display_name ?? "—"}</p>
                          {profile?.username && (
                            <p className="text-xs text-muted-foreground">@{profile.username}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">
                        {CERT_LABELS[tech.certification_level] ?? tech.certification_level}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {tech.total_inspections}
                    </td>
                    <td className="px-4 py-3">
                      {isCurrentManager ? (
                        <span className="text-xs text-muted-foreground">Current manager</span>
                      ) : (
                        <form action={removeTechnicianFromOrg.bind(null, tech.id)}>
                          <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            Remove
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No technicians yet. Invite one below.</p>
      )}

      {/* Invite form */}
      <div>
        <h2 className="mb-4 font-heading text-lg font-semibold">Add Technician</h2>
        <InviteTechnicianForm />
      </div>
    </div>
  );
}
