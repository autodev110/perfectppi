import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MediaPackagesPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Media Packages</h1>
      <Card>
        <CardHeader>
          <CardTitle>Media Packages</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Create and manage curated media collections for your vehicles. Coming in Phase E.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
