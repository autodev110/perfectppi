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
      toast.success("Installation code generated. Copy it now — it is shown once.");
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
      toast.success("Installation code revoked.");
      router.refresh();
    });

  const disconnect = (connectionId: string) =>
    startTransition(async () => {
      const result = await revokeConnection(connectionId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Connection revoked. Its credentials no longer work.");
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
      toast.success("New credentials issued. Copy both values into DealerSpace now.");
      router.refresh();
    });

  const unlinkUser = (linkId: string) =>
    startTransition(async () => {
      const result = await revokeUserLink(linkId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Account link revoked.");
      router.refresh();
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-4 w-4" />
          DealerSpace Integration
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {activeConnection ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {activeConnection.displayName ?? "DealerSpace"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Dealership ID{" "}
                    <span className="font-mono">
                      {activeConnection.externalOrganizationId}
                    </span>
                  </p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  Connected
                </span>
              </div>

              <dl className="mt-4 grid gap-x-8 gap-y-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Connected</dt>
                  <dd className="mt-0.5">{formatDateTime(activeConnection.connectedAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last used</dt>
                  <dd className="mt-0.5">
                    {activeConnection.lastUsedAt
                      ? formatDateTime(activeConnection.lastUsedAt)
                      : "Never"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Token</dt>
                  <dd className="mt-0.5 font-mono">{activeConnection.tokenIdentifier}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Scopes</dt>
                  <dd className="mt-0.5 font-mono">
                    {activeConnection.scopes.join(", ")}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Webhook endpoint</dt>
                  <dd className="mt-0.5 break-all font-mono">
                    {activeConnection.webhookUrl ?? "Not registered"}
                  </dd>
                </div>
              </dl>
            </div>

            {freshCredentials && (
              <SecretReveal
                title="New credentials — shown once"
                entries={[
                  ["Connection token", freshCredentials.token],
                  ["Webhook signing secret", freshCredentials.webhookSecret],
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
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Rotate credentials
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => disconnect(activeConnection.id)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Revoke connection
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Rotation replaces both credentials immediately. Copy the one-time values,
              then open DealerSpace → Settings → Perfect PPI and use “Verify and save
              credentials.” DealerSpace verifies both values before storing them.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate an installation code and give it to your DealerSpace
              administrator. They enter it in DealerSpace, which exchanges it for
              credentials over a server-to-server call. The code is valid for 30 minutes
              and works once.
            </p>

            {freshCode ? (
              <SecretReveal
                title="Installation code — shown once"
                entries={[["Code", freshCode]]}
              />
            ) : (
              <Button onClick={generate} disabled={pending} size="sm">
                {pending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-3.5 w-3.5" />
                )}
                Generate installation code
              </Button>
            )}

            {pendingCode && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs">
                <div>
                  <p className="font-mono font-medium">{pendingCode.codePrefix}-…</p>
                  <p className="text-muted-foreground">
                    Expires {formatDateTime(pendingCode.expiresAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => revokeCode(pendingCode.id)}
                >
                  Revoke
                </Button>
              </div>
            )}
          </div>
        )}

        {userLinks.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Linked technician accounts</p>
                <p className="text-xs text-muted-foreground">
                  Each technician authorized their own link. Revoking one stops that
                  DealerSpace user from assigning inspections to them.
                </p>
              </div>

              {userLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs"
                >
                  <div>
                    <p className="font-medium">
                      {link.displayName ?? link.username ?? "Technician"}
                    </p>
                    <p className="text-muted-foreground">
                      DealerSpace user{" "}
                      <span className="font-mono">{link.externalUserId}</span> · linked{" "}
                      {formatDateTime(link.linkedAt)}
                    </p>
                  </div>
                  {link.status === "active" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => unlinkUser(link.id)}
                    >
                      Revoke
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">Revoked</span>
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
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Could not copy — select the text manually.");
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

      <p className="mt-3 text-xs text-muted-foreground">
        Perfect PPI stores only a hash of these values and cannot show them again. If
        they are lost, rotate the credentials.
      </p>
    </div>
  );
}
