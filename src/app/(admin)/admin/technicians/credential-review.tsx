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

const selectClassName = "h-9 rounded-md border border-input bg-background px-2 text-xs";

export function CredentialReview({ credentials }: { credentials: TechnicianCredentialSummary[] }) {
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
    setMessage(result.ok ? "Review saved." : result.message);
    setBusyId(null);
  }

  async function revoke(formData: FormData, credentialId: string) {
    setBusyId(credentialId);
    setMessage(null);
    const result = await revokeCredential(credentialId, String(formData.get("revoke_reason") ?? ""));
    setMessage(result.ok ? "Credential revoked." : result.message);
    setBusyId(null);
  }

  if (credentials.length === 0) {
    return <p className="text-xs text-muted-foreground">No credential submissions.</p>;
  }

  return (
    <div className="min-w-[300px] space-y-3">
      {credentials.map((credential) => (
        <div key={credential.id} className="rounded-md border p-3">
          <p className="font-medium">{credential.credential_name}</p>
          <p className="text-xs text-muted-foreground">
            {credentialTypeLabel(credential.credential_type)} · {credential.issuer} · {credential.status}
          </p>
          {credential.scope && <p className="mt-1 text-xs">Scope: {credential.scope}</p>}
          {credential.expires_on && <p className="text-xs">Expires: {credential.expires_on}</p>}
          {evidenceById[credential.id] ? (
            <div className="mt-2 rounded-md bg-muted p-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Private evidence</p>
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
            >
              Reveal private evidence
            </Button>
          )}
          {credential.status === "pending" && (
            <form action={(formData) => decide(formData, credential.id)} className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                <select name="decision" className={selectClassName} defaultValue="approved">
                  <option value="approved">Approve</option>
                  <option value="rejected">Reject</option>
                </select>
                <select name="verification_method" className={selectClassName} defaultValue="issuer_registry">
                  <option value="issuer_registry">Issuer registry</option>
                  <option value="document_review">Document review</option>
                  <option value="issuer_confirmation">Issuer confirmation</option>
                  <option value="government_registry">Government registry</option>
                </select>
              </div>
              <Textarea name="reason" required minLength={10} maxLength={500} rows={2} placeholder="Record exactly what was checked and the decision basis." />
              <Button size="sm" type="submit" disabled={busyId === credential.id || !evidenceById[credential.id]}>
                Save review
              </Button>
            </form>
          )}
          {credential.status === "approved" && (
            <form action={(formData) => revoke(formData, credential.id)} className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                {verificationMethodLabel(credential.verification_method)}
                {credential.reviewed_at ? ` on ${new Date(credential.reviewed_at).toLocaleDateString()}` : ""}
              </p>
              <Textarea name="revoke_reason" required minLength={10} maxLength={500} rows={2} placeholder="Reason for revocation" />
              <Button size="sm" type="submit" variant="outline" disabled={busyId === credential.id}>Revoke credential</Button>
            </form>
          )}
        </div>
      ))}
      {message && <p className="text-xs text-muted-foreground" role="status">{message}</p>}
    </div>
  );
}
