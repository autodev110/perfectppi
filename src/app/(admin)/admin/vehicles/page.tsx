import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function VehicleManagementPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Vehicle Management</h1>
      <Card>
        <CardHeader>
          <CardTitle>Vehicle Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            View and manage all vehicles registered on the platform. Search by VIN, owner, or status.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
