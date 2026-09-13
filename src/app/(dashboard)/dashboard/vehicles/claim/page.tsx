import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VehicleClaimForm } from "./vehicle-claim-form";

export default function ClaimVehiclePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/vehicles"><ArrowLeft className="mr-2 h-4 w-4" />Back to Garage</Link>
      </Button>
      <div>
        <h1 className="font-heading text-2xl font-bold">Claim Purchased Vehicle</h1>
        <p className="mt-1 text-muted-foreground">Create your own private Garage record from a seller-authorized handoff.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Verify the handoff</CardTitle></CardHeader>
        <CardContent>
          <VehicleClaimForm />
        </CardContent>
      </Card>
    </div>
  );
}
