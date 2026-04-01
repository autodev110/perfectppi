import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewInspectionPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">New Inspection</h1>
      <Card>
        <CardHeader>
          <CardTitle>New Inspection</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Start a new pre-purchase inspection with the branching intake wizard. Coming in Phase B.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
