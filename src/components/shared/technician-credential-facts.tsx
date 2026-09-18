import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import {
  credentialTypeLabel,
  verificationMethodLabel,
  type PublicTechnicianCredential,
} from "@/features/technicians/credential-types";
import { t as uiText } from "@/lib/i18n";

export function TechnicianCredentialFacts({
  credentials,
  compact = false,
}: {
  credentials: PublicTechnicianCredential[];
  compact?: boolean;
}) {
  if (credentials.length === 0) {
    return compact ? (
      <Badge variant="outline">{uiText("ui.no_reviewed_credential_on_file_3ca3329926")}</Badge>
    ) : (
      <p className="text-sm text-muted-foreground">{uiText("ui.no_active_professional_credential_has_been_r_c5095aaa5a")}</p>
    );
  }

  if (compact) {
    return (
      <Badge variant="secondary" className="gap-1">
        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        {credentials.length === 1
          ? credentialTypeLabel(credentials[0].credential_type)
          : uiText("ui.reviewed_credentials_61bf8051c0", { arg0: String(credentials.length) })}
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
          <p className="mt-1 text-sm text-muted-foreground">{uiText("ui.issued_by_00289e4162")}{credential.issuer}
            {credential.scope ? uiText("ui.for_23887aff2f", { arg0: String(credential.scope) }) : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {verificationMethodLabel(credential.verification_method)}
            {credential.reviewed_at
              ? uiText("ui.by_perfectppi_trust_safety_on_fa4527b11f", { arg0: String(new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(credential.reviewed_at))) })
              : ""}
            {credential.expires_on
              ? uiText("ui.expires_c78912caa7", { arg0: String(new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${credential.expires_on}T00:00:00Z`))) })
              : uiText("ui.no_expiry_supplied_6fd18f5f78")}
          </p>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{uiText("ui.a_reviewed_credential_confirms_the_stated_re_d8e953c5d1")}{" "}
        <Link href="/support" className="underline">{uiText("ui.help_safety_ddae1fcf4d")}</Link>.
      </p>
    </div>
  );
}
