import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MyInspectionsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">My Inspections</h1>
      <Card>
        <CardHeader>
          <CardTitle>My Inspections</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            View and manage all your pre-purchase inspections. Coming in Phase B.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
