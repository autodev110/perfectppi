import { getAdminVehicles } from "@/features/admin/queries";
import { requireRole } from "@/features/auth/guards";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMileage } from "@/lib/utils/formatting";

import { getRequestTranslator } from "@/lib/i18n/server";

export default async function VehicleManagementPage() {
  const uiText = await getRequestTranslator();
  await requireRole(["admin"]);
  const { vehicles, total } = await getAdminVehicles();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.vehicle_management_b968d7b682")}</h1>
        <p className="text-muted-foreground">{total}{uiText("ui.vehicles_registered_on_the_platform_9da48a56d1")}</p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.vehicle_a62394ba4a")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.vin_5e0211b12d")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.mileage_ffe44a0179")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.owner_4b1b8aa360")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.visibility_7448611d5f")}</th>
              <th className="px-4 py-3 text-left font-medium">{uiText("ui.added_6b02e0d363")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {vehicles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{uiText("ui.no_vehicles_yet_45c11738a9")}</td>
              </tr>
            ) : (
              vehicles.map((vehicle) => {
                const owner = vehicle.owner as { display_name: string | null; username: string | null } | null;
                const primaryMedia =
                  vehicle.vehicle_media?.find((media) => media.is_primary) ??
                  vehicle.vehicle_media?.[0] ??
                  null;
                const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <tr key={vehicle.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-16 overflow-hidden rounded-lg bg-muted">
                          {primaryMedia ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={primaryMedia.url}
                              alt={label || uiText("ui.vehicle_a62394ba4a")}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <span className="font-medium">{label || "—"}</span>
                      </div>
                    </td>
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
