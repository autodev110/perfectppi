import { getAdminTechnicians } from "@/features/admin/queries";
import { requireRole } from "@/features/auth/guards";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, formatDate } from "@/lib/utils/formatting";
import { TechToggles } from "./tech-toggles";
import { CredentialReview } from "./credential-review";

export default async function TechnicianManagementPage() {
  await requireRole(["admin"]);
  const { technicians, total } = await getAdminTechnicians();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Technician Management</h1>
        <p className="text-muted-foreground">{total} technicians on the platform</p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Technician</th>
              <th className="px-4 py-3 text-left font-medium">Credential review</th>
              <th className="px-4 py-3 text-left font-medium">Organization</th>
              <th className="px-4 py-3 text-left font-medium">Inspections</th>
              <th className="px-4 py-3 text-left font-medium">Joined</th>
              <th className="px-4 py-3 text-left font-medium">Moderation</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {technicians.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No technicians yet.
                </td>
              </tr>
            ) : (
              technicians.map((tech) => {
                const profile = tech.profile as { display_name: string | null; username: string | null; avatar_url: string | null } | null;
                const org = tech.organization as { name: string } | null;
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
                      <CredentialReview credentials={tech.credentials} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {org?.name ?? <span className="italic">Independent</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {tech.total_inspections}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(tech.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <TechToggles
                        techId={tech.id}
                        isFeatured={tech.is_featured}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
