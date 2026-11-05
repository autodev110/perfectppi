"use client";

import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DeliveryStatusBadge,
  IntegrationStatusBadge,
} from "@/components/shared/source-badge";
import { SendToPartnerButton } from "@/components/shared/send-to-partner-button";

import { useTranslator } from "@/lib/i18n/client";

// ============================================================================
// The partner card on a technician's inspection screen: where the vehicle came
// from, what the partner sent, and the control that returns the finished
// reports. Renders nothing at all for ordinary consumer inspections.
// ============================================================================

interface PartnerContext {
  refId: string;
  sourceLabel: string | null;
  partnerLabel: string;
  autoDelivery: boolean;
  partnerName: string;
  connectionActive: boolean;
  integrationStatus: string;
  deliveryStatus: string;
  deliverablesReady: boolean;
  vehicleSnapshot: Record<string, unknown> | null;
  externalReconCaseId: string | null;
  canSend: boolean;
}

export function PartnerInspectionPanel({ requestId }: { requestId: string }) {
  const uiText = useTranslator();
  const [context, setContext] = useState<PartnerContext | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/ppi/requests/${requestId}/dealerspace`);
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setContext(body.data);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  if (!loaded || !context) return null;

  const snapshot = context.vehicleSnapshot ?? {};

  return (
    <Card className="border-blue-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-blue-600" />
          {context.sourceLabel ?? context.partnerName}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <IntegrationStatusBadge status={context.integrationStatus} />
          <DeliveryStatusBadge status={context.deliveryStatus} />
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          {[
            [uiText("ui.stock_number_74608bd0de"), snapshot.stockNumber],
            [uiText("ui.recon_case_c56ccf8ba9"), context.externalReconCaseId],
            [uiText("ui.exterior_cd41a1f4fd"), snapshot.exteriorColor],
            [uiText("ui.engine_8e75ebbdb2"), snapshot.engine],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-xs text-muted-foreground">{String(label)}</dt>
                <dd className="mt-0.5 font-medium">{String(value)}</dd>
              </div>
            ))}
        </dl>

        {!context.connectionActive && (
          <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{uiText("ui.this_connection_has_been_revoked_reports_can_e683b36599", { arg0: String(context.partnerLabel) })}</p>
        )}

        {context.canSend && context.connectionActive && (
          <SendToPartnerButton
            requestId={requestId}
            partnerLabel={context.partnerLabel}
            autoDelivery={context.autoDelivery}
            deliveryStatus={context.deliveryStatus}
            deliverablesReady={context.deliverablesReady}
          />
        )}
      </CardContent>
    </Card>
  );
}
