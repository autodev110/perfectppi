import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function OrganizationManagementPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Organization Management</h1>
      <Card>
        <CardHeader>
          <CardTitle>Organization Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Manage all organizations on the platform. Review shop details, membership rosters, and inspection volume.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
