import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SelfInspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Self-PPI Inspection</h1>
      <Card>
        <CardHeader>
          <CardTitle>Inspect Vehicle — {id}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Full-screen guided inspection with direct device camera capture. Coming in Phase B.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
