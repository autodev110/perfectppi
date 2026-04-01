import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Shared Content",
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Phase E will implement share link resolution
  // For now, show a placeholder
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Shared Content</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Share link resolution will be available in a future update.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Token: {token}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
