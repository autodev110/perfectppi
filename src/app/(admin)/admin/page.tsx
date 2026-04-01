import { getAdminMetrics } from "@/features/admin/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Wrench, Building2, Car } from "lucide-react";
import Link from "next/link";

export default async function AdminOverviewPage() {
  const metrics = await getAdminMetrics();

  const stats = [
    {
      label: "Total Users",
      value: metrics.totalUsers,
      icon: Users,
      href: "/admin/users",
    },
    {
      label: "Technicians",
      value: metrics.totalTechnicians,
      icon: Wrench,
      href: "/admin/technicians",
    },
    {
      label: "Organizations",
      value: metrics.totalOrganizations,
      icon: Building2,
      href: "/admin/organizations",
    },
    {
      label: "Vehicles",
      value: metrics.totalVehicles,
      icon: Car,
      href: "/admin/vehicles",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Admin Overview</h1>
        <p className="text-muted-foreground">Platform-wide metrics</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{value.toLocaleString()}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
