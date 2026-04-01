import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuditLogPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Audit Log</h1>
      <Card>
        <CardHeader>
          <CardTitle>Audit Log</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Platform-wide audit trail tracking all state changes, edits, regenerations, and administrative actions. Coming in Phase C.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
