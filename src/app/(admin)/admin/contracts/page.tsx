import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ContractsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Contracts</h1>
      <Card>
        <CardHeader>
          <CardTitle>Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            View and manage all DocuSeal contracts. Track signature status, presentation dates, and completion rates. Coming in Phase D.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
