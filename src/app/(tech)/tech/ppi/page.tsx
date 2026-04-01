import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function InspectionQueuePage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Inspection Queue</h1>
      <Card>
        <CardHeader>
          <CardTitle>Inspection Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Your assigned inspection requests and queue will appear here. Coming in Phase B.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
