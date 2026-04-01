import { getMyOrgWithTechnicianCount } from "@/features/organizations/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Users, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function OrgDashboardPage() {
  const result = await getMyOrgWithTechnicianCount();
  if (!result) redirect("/login");

  const { org, techCount } = result;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{org.name}</h1>
        <p className="text-muted-foreground">Organization overview</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Technicians</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{techCount}</div>
            <Button variant="link" className="mt-1 h-auto p-0 text-xs" asChild>
              <Link href="/org/technicians">Manage team</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Inspections</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">—</div>
            <Button variant="link" className="mt-1 h-auto p-0 text-xs" asChild>
              <Link href="/org/inspections">View all</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Organization</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground truncate">{org.slug}</p>
            <Button variant="link" className="mt-1 h-auto p-0 text-xs" asChild>
              <Link href="/org/profile">Edit profile</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
