import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function UserManagementPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">User Management</h1>
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            View, search, and manage all platform users. Filter by role, status, and activity.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
