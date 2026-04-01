import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Payments</h1>
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            View all Stripe payments, track transaction status, and manage refunds across the platform. Coming in Phase D.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
