import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminOverviewPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Admin Overview</h1>
      <Card>
        <CardHeader>
          <CardTitle>Platform Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Platform-wide metrics, user counts, inspection volume, warranty stats, and system health will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
