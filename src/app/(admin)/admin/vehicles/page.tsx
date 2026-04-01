import { getAdminVehicles } from "@/features/admin/queries";
import { requireRole } from "@/features/auth/guards";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMileage } from "@/lib/utils/formatting";

export default async function VehicleManagementPage() {
  await requireRole(["admin"]);
  const { vehicles, total } = await getAdminVehicles();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Vehicle Management</h1>
        <p className="text-muted-foreground">{total} vehicles registered on the platform</p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Vehicle</th>
              <th className="px-4 py-3 text-left font-medium">VIN</th>
              <th className="px-4 py-3 text-left font-medium">Mileage</th>
              <th className="px-4 py-3 text-left font-medium">Owner</th>
              <th className="px-4 py-3 text-left font-medium">Visibility</th>
              <th className="px-4 py-3 text-left font-medium">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {vehicles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No vehicles yet.
                </td>
              </tr>
            ) : (
              vehicles.map((vehicle) => {
                const owner = vehicle.owner as { display_name: string | null; username: string | null } | null;
                const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <tr key={vehicle.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{label || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {vehicle.vin ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {vehicle.mileage != null ? formatMileage(vehicle.mileage) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {owner?.display_name ?? owner?.username ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={vehicle.visibility === "public" ? "secondary" : "outline"}>
                        {vehicle.visibility}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(vehicle.created_at)}
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
