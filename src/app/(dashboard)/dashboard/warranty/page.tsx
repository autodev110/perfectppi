import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MyWarrantiesPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">My Warranties</h1>
      <Card>
        <CardHeader>
          <CardTitle>My Warranties</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            View and manage your vehicle service contracts. Coming in Phase D.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
