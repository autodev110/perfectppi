import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function OutputsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Outputs</h1>
      <Card>
        <CardHeader>
          <CardTitle>Outputs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            View all standardized PPI outputs and VSC outputs generated on the platform. Track generation status and versions. Coming in Phase C.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
