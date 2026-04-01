import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ManageTechniciansPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Manage Technicians</h1>
      <Card>
        <CardHeader>
          <CardTitle>Technician Roster</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Manage your organization&apos;s technician roster, invite new technicians, and view individual performance here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
