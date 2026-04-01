import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function EditInspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Edit Inspection</h1>
      <Card>
        <CardHeader>
          <CardTitle>Edit Inspection — {id}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Edit and resubmit your inspection with versioning support. Coming in Phase B.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
