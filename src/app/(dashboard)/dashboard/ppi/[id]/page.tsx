import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Inspection Detail</h1>
      <Card>
        <CardHeader>
          <CardTitle>Inspection {id}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            View inspection details, status, and results. Coming in Phase B.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
