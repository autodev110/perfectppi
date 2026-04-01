import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function GuidedInspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Guided Inspection Workflow</h1>
      <Card>
        <CardHeader>
          <CardTitle>Inspecting Request #{id}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            The full-screen guided inspection workflow with section-by-section card steps, device camera capture, and progress tracking. Coming in Phase B.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
