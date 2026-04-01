import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CommunicationsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Communications</h1>
      <Card>
        <CardHeader>
          <CardTitle>Communications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Monitor platform-wide messaging, conversations, and communication activity. Coming in Phase E.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
