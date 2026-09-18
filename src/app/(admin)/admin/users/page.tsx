import { getAdminUsers } from "@/features/admin/queries";
import { provisionAdmin, demoteToConsumer } from "@/features/admin/actions";
import { requireRole } from "@/features/auth/guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/formatting";

import { getRequestTranslator } from "@/lib/i18n/server";

const ROLE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  admin: "default",
  org_manager: "secondary",
  technician: "outline",
  consumer: "outline",
};

export default async function UserManagementPage() {
  const uiText = await getRequestTranslator();
  await requireRole(["admin"]);
  const { users, total } = await getAdminUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.user_management_fe45f3a1ad")}</h1>
        <p className="text-muted-foreground">{total}{uiText("ui.total_users_f66a936aa7")}</p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.name_dcd1d5223f")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.username_e3b89e9d33")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.role_14736a2eb9")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.joined_69318b0c6a")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.actions_ff8059dc67")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">
                  {user.display_name ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {user.username ? uiText("ui.text_d513a96df3", { arg0: String(user.username) }) : "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={ROLE_VARIANT[user.role] ?? "outline"}>
                    {user.role}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(user.created_at)}
                </td>
                <td className="px-4 py-3">
                  {user.role !== "admin" ? (
                    <form action={provisionAdmin.bind(null, user.id)}>
                      <Button type="submit" variant="outline" size="sm">{uiText("ui.make_admin_f60d9ee5b4")}</Button>
                    </form>
                  ) : (
                    <form action={demoteToConsumer.bind(null, user.id)}>
                      <Button type="submit" variant="ghost" size="sm">{uiText("ui.demote_bf0692a703")}</Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
