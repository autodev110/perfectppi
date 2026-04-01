import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AllInspectionsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">All Inspections</h1>
      <Card>
        <CardHeader>
          <CardTitle>All Inspections</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Platform-wide inspection list with filtering by status, type, technician, and date range. Coming in Phase B.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
