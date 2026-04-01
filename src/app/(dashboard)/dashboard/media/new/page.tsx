import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CreateMediaPackagePage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Create Media Package</h1>
      <Card>
        <CardHeader>
          <CardTitle>Create Media Package</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Build a new media package with images, videos, and files. Coming in Phase E.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
