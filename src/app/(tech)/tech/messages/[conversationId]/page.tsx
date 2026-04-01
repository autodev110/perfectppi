import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TechConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Conversation</h1>
      <Card>
        <CardHeader>
          <CardTitle>Conversation #{conversationId}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            The full conversation thread with message history and reply input will appear here. Coming in Phase E.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
