import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function WarrantyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Warranty Detail</h1>
      <Card>
        <CardHeader>
          <CardTitle>Warranty {id}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            View warranty contract details, coverage, and payment status. Coming in Phase D.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
