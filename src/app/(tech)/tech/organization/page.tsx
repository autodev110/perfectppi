import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TechOrganizationPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Organization</h1>
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            View your organization association, shop details, and team members here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
