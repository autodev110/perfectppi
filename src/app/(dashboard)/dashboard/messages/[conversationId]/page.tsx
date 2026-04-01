import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ConversationPage({
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
          <CardTitle>Conversation {conversationId}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            View and reply to messages in this conversation. Coming in Phase E.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
