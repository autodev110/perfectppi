import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WarrantiesPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Warranties</h1>
      <Card>
        <CardHeader>
          <CardTitle>Warranties</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Manage all warranty options, orders, and active contracts across the platform. Coming in Phase D.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
