"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plug, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { revokeConnection, revokeUserLink } from "@/features/partner/connections";
import type { SafeConnectionView, UserLinkView } from "@/features/partner/queries";
import { formatDateTime } from "@/lib/utils/formatting";
import { t as uiText } from "@/lib/i18n";


// ============================================================================
// A partner that connects from its own app. There is nothing to generate or
// paste here, so this panel only reports the connection and can revoke it.
// ============================================================================

export function BrowserPartnerPanel({
  partnerName,
  connection,
  userLinks,
}: {
  partnerName: string;
  connection: SafeConnectionView | null;
  userLinks: UserLinkView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const disconnect = (connectionId: string) =>
    startTransition(async () => {
      const result = await revokeConnection(connectionId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`${partnerName} disconnected.`);
      router.refresh();
    });

  const unlink = (linkId: string) =>
    startTransition(async () => {
      const result = await revokeUserLink(linkId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(uiText("ui.account_link_revoked_f24a7fee53"));
      router.refresh();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-4 w-4" />
          {partnerName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {connection ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-4">
            <div className="min-w-0">
              <p className="font-semibold">{connection.displayName ?? partnerName}</p>
              <p className="text-xs text-muted-foreground">
                {uiText("ui.connected_reports_are_sent_to_automatically_e5db499cfe", { arg0: String(formatDateTime(connection.connectedAt)), arg1: String(partnerName) })}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => disconnect(connection.id)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />{uiText("ui.disconnect_acfc5be785")}</Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {uiText("ui.to_connect_open_inspections_in_and_choose_co_61bdbaed08", { arg0: String(partnerName) })}
          </p>
        )}

        {userLinks.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <p className="text-sm font-medium">{uiText("ui.linked_technician_accounts_b6e48bddab")}</p>
              {userLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs"
                >
                  <p className="font-medium">
                    {link.displayName ?? link.username ?? uiText("ui.technician_9041ccc417")}
                  </p>
                  {link.status === "active" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => unlink(link.id)}
                    >{uiText("ui.revoke_87e6d00bbf")}</Button>
                  ) : (
                    <span className="text-muted-foreground">{uiText("ui.revoked_f6f738d043")}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
