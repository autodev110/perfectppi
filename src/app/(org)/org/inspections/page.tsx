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
            View all inspections performed by your organization&apos;s technicians, filter by status, and track progress. Coming in Phase B.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
