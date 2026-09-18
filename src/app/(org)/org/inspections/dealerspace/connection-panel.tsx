"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plug,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/utils/formatting";
import {
  createInstallationCode,
  revokeConnection,
  revokeInstallationCode,
  revokeUserLink,
  rotateConnectionCredentials,
} from "@/features/partner/connections";
import type {
  InstallationCodeView,
  SafeConnectionView,
  UserLinkView,
} from "@/features/partner/queries";

import { useTranslator } from "@/lib/i18n/client";

// ============================================================================
// DealerSpace connection panel.
//
// Secrets appear exactly once, at the moment they are minted, and are never
// re-readable. Everything the server sends to this component is safe to render:
// a token *identifier*, never a token.
// ============================================================================

interface Props {
  connections: SafeConnectionView[];
  codes: InstallationCodeView[];
  userLinks: UserLinkView[];
}

export function DealerSpaceConnectionPanel({ connections, codes, userLinks }: Props) {
  const uiText = useTranslator();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [freshCredentials, setFreshCredentials] = useState<{
    token: string;
    webhookSecret: string;
  } | null>(null);

  const activeConnection = connections.find((c) => c.status === "active");
  const pendingCode = codes.find((c) => c.status === "pending" && !c.isExpired);

  const generate = () =>
    startTransition(async () => {
      const result = await createInstallationCode();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setFreshCode(result.data.code);
      toast.success(uiText("ui.installation_code_generated_copy_it_now_it_i_5b29698e1a"));
      router.refresh();
    });

  const revokeCode = (codeId: string) =>
    startTransition(async () => {
      const result = await revokeInstallationCode(codeId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setFreshCode(null);
      toast.success(uiText("ui.installation_code_revoked_72059237b0"));
      router.refresh();
    });

  const disconnect = (connectionId: string) =>
    startTransition(async () => {
      const result = await revokeConnection(connectionId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(uiText("ui.connection_revoked_its_credentials_no_longer_f479709e90"));
      router.refresh();
    });

  const rotate = (connectionId: string) =>
    startTransition(async () => {
      const result = await rotateConnectionCredentials(connectionId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setFreshCredentials(result.data);
      toast.success(uiText("ui.new_credentials_issued_copy_both_values_into_89368abb70"));
      router.refresh();
    });

  const unlinkUser = (linkId: string) =>
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
          <Plug className="h-4 w-4" />{uiText("ui.dealerspace_integration_d9a02ce966")}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {activeConnection ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {activeConnection.displayName ?? uiText("ui.dealerspace_7d7288383a")}
                  </p>
                  <p className="text-xs text-muted-foreground">{uiText("ui.dealership_id_452b0d8a6f")}{" "}
                    <span className="font-mono">
                      {activeConnection.externalOrganizationId}
                    </span>
                  </p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">{uiText("ui.connected_22965568d2")}</span>
              </div>

              <dl className="mt-4 grid gap-x-8 gap-y-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{uiText("ui.connected_22965568d2")}</dt>
                  <dd className="mt-0.5">{formatDateTime(activeConnection.connectedAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{uiText("ui.last_used_830ec7f812")}</dt>
                  <dd className="mt-0.5">
                    {activeConnection.lastUsedAt
                      ? formatDateTime(activeConnection.lastUsedAt)
                      : uiText("ui.never_6300ef800b")}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{uiText("ui.token_d2089be672")}</dt>
                  <dd className="mt-0.5 font-mono">{activeConnection.tokenIdentifier}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{uiText("ui.scopes_0d5644ff52")}</dt>
                  <dd className="mt-0.5 font-mono">
                    {activeConnection.scopes.join(", ")}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">{uiText("ui.webhook_endpoint_42b43613f6")}</dt>
                  <dd className="mt-0.5 break-all font-mono">
                    {activeConnection.webhookUrl ?? uiText("ui.not_registered_ca374c23ed")}
                  </dd>
                </div>
              </dl>
            </div>

            {freshCredentials && (
              <SecretReveal
                title={uiText("ui.new_credentials_shown_once_271428dae7")}
                entries={[
                  [uiText("ui.connection_token_ffde763442"), freshCredentials.token],
                  [uiText("ui.webhook_signing_secret_48c7cde407"), freshCredentials.webhookSecret],
                ]}
              />
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => rotate(activeConnection.id)}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />{uiText("ui.rotate_credentials_99374a232d")}</Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => disconnect(activeConnection.id)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />{uiText("ui.revoke_connection_473c85193b")}</Button>
            </div>

            <p className="text-xs text-muted-foreground">{uiText("ui.rotation_replaces_both_credentials_immediate_b8c7de41c1")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{uiText("ui.generate_an_installation_code_and_give_it_to_fa168bfde3")}</p>

            {freshCode ? (
              <SecretReveal
                title={uiText("ui.installation_code_shown_once_22f91c733a")}
                entries={[[uiText("ui.code_340f463033"), freshCode]]}
              />
            ) : (
              <Button onClick={generate} disabled={pending} size="sm">
                {pending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-3.5 w-3.5" />
                )}{uiText("ui.generate_installation_code_d0e301dc0f")}</Button>
            )}

            {pendingCode && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs">
                <div>
                  <p className="font-mono font-medium">{pendingCode.codePrefix}-…</p>
                  <p className="text-muted-foreground">{uiText("ui.expires_d970e4fd10")}{formatDateTime(pendingCode.expiresAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => revokeCode(pendingCode.id)}
                >{uiText("ui.revoke_87e6d00bbf")}</Button>
              </div>
            )}
          </div>
        )}

        {userLinks.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">{uiText("ui.linked_technician_accounts_b6e48bddab")}</p>
                <p className="text-xs text-muted-foreground">{uiText("ui.each_technician_authorized_their_own_link_re_b639a35c50")}</p>
              </div>

              {userLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs"
                >
                  <div>
                    <p className="font-medium">
                      {link.displayName ?? link.username ?? uiText("ui.technician_9041ccc417")}
                    </p>
                    <p className="text-muted-foreground">{uiText("ui.dealerspace_user_fb704b40fc")}{" "}
                      <span className="font-mono">{link.externalUserId}</span>{uiText("ui.linked_105bbb09b1")}{" "}
                      {formatDateTime(link.linkedAt)}
                    </p>
                  </div>
                  {link.status === "active" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => unlinkUser(link.id)}
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

function SecretReveal({
  title,
  entries,
}: {
  title: string;
  entries: Array<[string, string]>;
}) {
  const uiText = useTranslator();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error(uiText("ui.could_not_copy_select_the_text_manually_1e283da2cc"));
    }
  };

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4" />
        <p className="text-sm font-semibold">{title}</p>
      </div>

      <div className="space-y-3">
        {entries.map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1.5 font-mono text-xs">
                {value}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copy(label, value)}
                className="shrink-0"
              >
                {copied === label ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{uiText("ui.perfect_ppi_stores_only_a_hash_of_these_valu_93b0ce8675")}</p>
    </div>
  );
}
