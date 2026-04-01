import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TechMessagesPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Messages</h1>
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Your conversations with consumers and other technicians will appear here. Coming in Phase E.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
