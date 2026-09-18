import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VehicleClaimForm } from "./vehicle-claim-form";
import { t as uiText } from "@/lib/i18n";

export default function ClaimVehiclePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/vehicles"><ArrowLeft className="mr-2 h-4 w-4" />{uiText("ui.back_to_garage_9e8ca01aba")}</Link>
      </Button>
      <div>
        <h1 className="font-heading text-2xl font-bold">{uiText("ui.claim_purchased_vehicle_2a5c01dcab")}</h1>
        <p className="mt-1 text-muted-foreground">{uiText("ui.create_your_own_private_garage_record_from_a_f36a71961d")}</p>
      </div>
      <Card>
        <CardHeader><CardTitle>{uiText("ui.verify_the_handoff_0b6174f571")}</CardTitle></CardHeader>
        <CardContent>
          <VehicleClaimForm />
        </CardContent>
      </Card>
    </div>
  );
}
