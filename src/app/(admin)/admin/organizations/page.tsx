import { getAdminOrganizations } from "@/features/admin/queries";
import { requireRole } from "@/features/auth/guards";
import { formatDate } from "@/lib/utils/formatting";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building2 } from "lucide-react";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function OrganizationManagementPage() {
  const uiText = await getRequestTranslator();
  await requireRole(["admin"]);
  const { organizations, total } = await getAdminOrganizations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.organization_management_780ad17cd2")}</h1>
        <p className="text-muted-foreground">{total}{uiText("ui.organizations_on_the_platform_578cadd7b3")}</p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.organization_d764d42592")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.slug_d15387ecc6")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.description_526e0087cc")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.created_d70b9e24bc")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {organizations.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">{uiText("ui.no_organizations_yet_b774afc97a")}</td>
              </tr>
            ) : (
              organizations.map((org) => (
                <tr key={org.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 rounded">
                        <AvatarImage src={org.logo_url ?? ""} alt={org.name} />
                        <AvatarFallback className="rounded">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                      <p className="font-medium">{org.name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {org.slug}
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">
                    {org.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(org.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
