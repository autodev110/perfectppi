import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import {
  credentialTypeLabel,
  verificationMethodLabel,
  type PublicTechnicianCredential,
} from "@/features/technicians/credential-types";

export function TechnicianCredentialFacts({
  credentials,
  compact = false,
}: {
  credentials: PublicTechnicianCredential[];
  compact?: boolean;
}) {
  if (credentials.length === 0) {
    return compact ? (
      <Badge variant="outline">No reviewed credential on file</Badge>
    ) : (
      <p className="text-sm text-muted-foreground">
        No active professional credential has been reviewed by PerfectPPI.
      </p>
    );
  }

  if (compact) {
    return (
      <Badge variant="secondary" className="gap-1">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        {credentials.length === 1
          ? credentialTypeLabel(credentials[0].credential_type)
          : `${credentials.length} reviewed credentials`}
      </Badge>
    );
  }

  return (
    <div className="space-y-3">
      {credentials.map((credential) => (
        <div key={credential.id} className="rounded-lg border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <p className="font-medium">{credential.credential_name}</p>
            <Badge variant="secondary">{credentialTypeLabel(credential.credential_type)}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Issued by {credential.issuer}
            {credential.scope ? ` for ${credential.scope}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {verificationMethodLabel(credential.verification_method)}
            {credential.reviewed_at
              ? ` by PerfectPPI Trust & Safety on ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(credential.reviewed_at))}`
              : ""}
            {credential.expires_on
              ? ` · expires ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${credential.expires_on}T00:00:00Z`))}`
              : " · no expiry supplied"}
          </p>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        A reviewed credential confirms the stated record and scope only; it is not an endorsement or a guarantee of work. To request a correction, contact{" "}
        <Link href="/support" className="underline">Help &amp; Safety</Link>.
      </p>
    </div>
  );
}
