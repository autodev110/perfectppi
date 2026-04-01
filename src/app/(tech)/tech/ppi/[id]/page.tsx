import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function InspectionRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Inspection Request Detail</h1>
      <Card>
        <CardHeader>
          <CardTitle>Request #{id}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Detailed view of the inspection request including vehicle info, requester details, and action buttons. Coming in Phase B.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
