"use client";

import { useState } from "react";
import {
  revealCredentialEvidence,
  reviewCredential,
  revokeCredential,
} from "@/features/admin/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  credentialTypeLabel,
  verificationMethodLabel,
  type TechnicianCredentialSummary,
} from "@/features/technicians/credential-types";

import { useTranslator } from "@/lib/i18n/client";

const selectClassName = "h-9 rounded-md border border-input bg-background px-2 text-xs";

export function CredentialReview({ credentials }: { credentials: TechnicianCredentialSummary[] }) {
  const uiText = useTranslator();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [evidenceById, setEvidenceById] = useState<Record<string, string>>({});

  async function reveal(credentialId: string) {
    setBusyId(credentialId);
    setMessage(null);
    const result = await revealCredentialEvidence(credentialId);
    if (result.ok) {
      setEvidenceById((current) => ({ ...current, [credentialId]: result.evidence }));
    } else {
      setMessage(result.message);
    }
    setBusyId(null);
  }

  async function decide(formData: FormData, credentialId: string) {
    setBusyId(credentialId);
    setMessage(null);
    const result = await reviewCredential(
      credentialId,
      formData.get("decision") as "approved" | "rejected",
      formData.get("verification_method") as "issuer_registry" | "document_review" | "issuer_confirmation" | "government_registry",
      String(formData.get("reason") ?? ""),
    );
    setMessage(result.ok ? uiText("ui.review_saved_640b4e3de7") : result.message);
    setBusyId(null);
  }

  async function revoke(formData: FormData, credentialId: string) {
    setBusyId(credentialId);
    setMessage(null);
    const result = await revokeCredential(credentialId, String(formData.get("revoke_reason") ?? ""));
    setMessage(result.ok ? uiText("ui.credential_revoked_fa8d993596") : result.message);
    setBusyId(null);
  }

  if (credentials.length === 0) {
    return <p className="text-xs text-muted-foreground">{uiText("ui.no_credential_submissions_278317a008")}</p>;
  }

  return (
    <div className="min-w-[300px] space-y-3">
      {credentials.map((credential) => (
        <div key={credential.id} className="rounded-md border p-3">
          <p className="font-medium">{credential.credential_name}</p>
          <p className="text-xs text-muted-foreground">
            {credentialTypeLabel(credential.credential_type)} · {credential.issuer} · {credential.status}
          </p>
          {credential.scope && <p className="mt-1 text-xs">{uiText("ui.scope_b8417b265b")}{credential.scope}</p>}
          {credential.expires_on && <p className="text-xs">{uiText("ui.expires_9fe7928a78")}{credential.expires_on}</p>}
          {evidenceById[credential.id] ? (
            <div className="mt-2 rounded-md bg-muted p-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{uiText("ui.private_evidence_d9f533ca8b")}</p>
              <p className="mt-1 break-words text-xs">{evidenceById[credential.id]}</p>
            </div>
          ) : (
            <Button
              className="mt-2"
              size="sm"
              type="button"
              variant="outline"
              disabled={busyId === credential.id}
              onClick={() => reveal(credential.id)}
            >{uiText("ui.reveal_private_evidence_607164b969")}</Button>
          )}
          {credential.status === "pending" && (
            <form action={(formData) => decide(formData, credential.id)} className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <select name="decision" className={selectClassName} defaultValue="approved">
                  <option value="approved">{uiText("ui.approve_6007acbe30")}</option>
                  <option value="rejected">{uiText("ui.reject_ab604a3607")}</option>
                </select>
                <select name="verification_method" className={selectClassName} defaultValue="issuer_registry">
                  <option value="issuer_registry">{uiText("ui.issuer_registry_09242add4c")}</option>
                  <option value="document_review">{uiText("ui.document_review_da28ff269e")}</option>
                  <option value="issuer_confirmation">{uiText("ui.issuer_confirmation_3902ea0762")}</option>
                  <option value="government_registry">{uiText("ui.government_registry_a1cd3e26f1")}</option>
                </select>
              </div>
              <Textarea name="reason" required minLength={10} maxLength={500} rows={2} placeholder={uiText("ui.record_exactly_what_was_checked_and_the_deci_9fc7b85865")} />
              <Button size="sm" type="submit" disabled={busyId === credential.id || !evidenceById[credential.id]}>{uiText("ui.save_review_e5a490bf2c")}</Button>
            </form>
          )}
          {credential.status === "approved" && (
            <form action={(formData) => revoke(formData, credential.id)} className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                {verificationMethodLabel(credential.verification_method)}
                {credential.reviewed_at ? uiText("ui.on_fa8fa8dead", { arg0: String(new Date(credential.reviewed_at).toLocaleDateString()) }) : ""}
              </p>
              <Textarea name="revoke_reason" required minLength={10} maxLength={500} rows={2} placeholder={uiText("ui.reason_for_revocation_d467443554")} />
              <Button size="sm" type="submit" variant="outline" disabled={busyId === credential.id}>{uiText("ui.revoke_credential_10b7bc9472")}</Button>
            </form>
          )}
        </div>
      ))}
      {message && <p className="text-xs text-muted-foreground" role="status">{message}</p>}
    </div>
  );
}
