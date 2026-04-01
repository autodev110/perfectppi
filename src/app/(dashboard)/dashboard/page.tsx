import { getMyProfile } from "@/features/profiles/queries";
import { getMyVehicles } from "@/features/vehicles/queries";
import { getMyPpiRequestCount } from "@/features/ppi/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Car, ClipboardCheck, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/login");

  const [vehicles, inspectionCount] = await Promise.all([
    getMyVehicles(),
    getMyPpiRequestCount(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">
          Welcome{profile.display_name ? `, ${profile.display_name}` : ""}
        </h1>
        <p className="text-muted-foreground">
          Your vehicle inspection dashboard.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vehicles</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vehicles.length}</div>
            <Button variant="link" className="mt-1 h-auto p-0 text-xs" asChild>
              <Link href="/dashboard/vehicles">View all</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Inspections</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inspectionCount}</div>
            <Button variant="link" className="mt-1 h-auto p-0 text-xs" asChild>
              <Link href="/dashboard/ppi">View all</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button asChild>
          <Link href="/dashboard/vehicles/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Vehicle
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/ppi/new">
            <ClipboardCheck className="mr-2 h-4 w-4" />
            New Inspection
          </Link>
        </Button>
      </div>
    </div>
  );
}
