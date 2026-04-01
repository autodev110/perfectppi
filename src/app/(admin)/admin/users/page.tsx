import { getAdminUsers } from "@/features/admin/queries";
import { provisionAdmin, demoteToConsumer } from "@/features/admin/actions";
import { requireRole } from "@/features/auth/guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/formatting";

const ROLE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  admin: "default",
  org_manager: "secondary",
  technician: "outline",
  consumer: "outline",
};

export default async function UserManagementPage() {
  await requireRole(["admin"]);
  const { users, total } = await getAdminUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">User Management</h1>
        <p className="text-muted-foreground">{total} total users</p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Username</th>
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Joined</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">
                  {user.display_name ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {user.username ? `@${user.username}` : "—"}
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
                      <Button type="submit" variant="outline" size="sm">
                        Make Admin
                      </Button>
                    </form>
                  ) : (
                    <form action={demoteToConsumer.bind(null, user.id)}>
                      <Button type="submit" variant="ghost" size="sm">
                        Demote
                      </Button>
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
