import { getMyTechProfile } from "@/features/technicians/queries";
import { getMyPpiRequestCount, getMyTechQueueCount } from "@/features/ppi/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Star, Wrench } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

const CERT_LABELS: Record<string, string> = {
  none: "Uncertified",
  ase: "ASE Certified",
  master: "ASE Master",
  oem_qualified: "OEM Qualified",
};

export default async function TechDashboardPage() {
  const techProfile = await getMyTechProfile();
  if (!techProfile) redirect("/login");

  const [queueCount, totalRequested] = await Promise.all([
    getMyTechQueueCount(),
    getMyPpiRequestCount(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Technician Dashboard</h1>
        <p className="text-muted-foreground">Your inspection queue and stats.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending in Queue</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{queueCount}</div>
            <Button variant="link" className="mt-1 h-auto p-0 text-xs" asChild>
              <Link href="/tech/ppi">View queue</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Completed</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{techProfile.total_inspections}</div>
            <p className="mt-1 text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Certification</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">
              {CERT_LABELS[techProfile.certification_level] ?? techProfile.certification_level}
            </Badge>
            <Button variant="link" className="mt-2 block h-auto p-0 text-xs" asChild>
              <Link href="/tech/profile">Update profile</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
