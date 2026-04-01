import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function OrgSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Organization Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Organization Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Configure organization-level settings, notification preferences, and membership policies here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
