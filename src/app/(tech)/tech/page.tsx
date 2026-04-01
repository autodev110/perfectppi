import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TechDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Technician Dashboard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Welcome Back</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Your technician dashboard with quick stats, recent activity, and pending inspections will appear here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
