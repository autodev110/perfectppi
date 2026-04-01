import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TechnicianManagementPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Technician Management</h1>
      <Card>
        <CardHeader>
          <CardTitle>Technician Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Manage all technicians on the platform. Review certifications, verify credentials, and monitor inspection activity.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
