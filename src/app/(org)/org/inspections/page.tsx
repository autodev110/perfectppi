import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function OrgInspectionsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Organization Inspections</h1>
      <Card>
        <CardHeader>
          <CardTitle>Organization Inspections</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Organization-wide inspection tracking and filters for your technicians are planned for a later phase.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
