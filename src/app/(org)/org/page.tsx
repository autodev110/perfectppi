import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function OrgDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Organization Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Organization Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Your organization dashboard with team activity, inspection stats, and quick actions will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
