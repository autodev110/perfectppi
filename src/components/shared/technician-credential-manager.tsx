"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CREDENTIAL_TYPE_LABELS,
  credentialTypeLabel,
  type CredentialType,
  type TechnicianCredential,
} from "@/features/technicians/credential-types";
import { t as uiText } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm";

function statusLabel(status: string) {
  if (status === "approved") return uiText("ui.reviewed_and_active_cb78c34ec1");
  if (status === "rejected") return uiText("ui.not_approved_ad2815011b");
  if (status === "revoked") return uiText("ui.revoked_f6f738d043");
  return uiText("ui.awaiting_review_4848885e3f");
}

export function TechnicianCredentialManager() {
  const uiText = useTranslator();
  const [credentials, setCredentials] = useState<TechnicianCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/technicians/me/credentials", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? uiText("ui.credentials_could_not_be_loaded_9987b8e3a5"));
      setCredentials(body.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : uiText("ui.credentials_could_not_be_loaded_9987b8e3a5"));
    } finally {
      setLoading(false);
    }
  }, [uiText]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(formData: FormData) {
    setSaving(true);
    setMessage(null);
    const nullable = (name: string) => {
      const value = String(formData.get(name) ?? "").trim();
      return value || null;
    };
    const payload = {
      credential_type: String(formData.get("credential_type") ?? "other"),
      credential_name: String(formData.get("credential_name") ?? ""),
      issuer: String(formData.get("issuer") ?? ""),
      scope: nullable("scope"),
      credential_identifier_last4: nullable("credential_identifier_last4"),
      issued_on: nullable("issued_on"),
      expires_on: nullable("expires_on"),
      evidence_reference: String(formData.get("evidence_reference") ?? ""),
      supersedes_credential_id: nullable("supersedes_credential_id"),
    };

    try {
      const response = await fetch("/api/technicians/me/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? uiText("ui.credential_could_not_be_submitted_04c4cccced"));
      setMessage(uiText("ui.credential_submitted_for_trust_safety_review_b0db17ac27"));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : uiText("ui.credential_could_not_be_submitted_04c4cccced"));
    } finally {
      setSaving(false);
    }
  }

  const replaceable = credentials.filter((credential) => credential.status === "approved");

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">{uiText("ui.loading_credentials_e854b8f850")}</p>}
        {!loading && credentials.length === 0 && (
          <p className="text-sm text-muted-foreground">{uiText("ui.no_credentials_have_been_submitted_d148819821")}</p>
        )}
        {credentials.map((credential) => (
          <div key={credential.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{credential.credential_name}</p>
              <span className="text-xs font-medium text-muted-foreground">{statusLabel(credential.status)}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {credentialTypeLabel(credential.credential_type)} · {credential.issuer}
              {credential.expires_on ? uiText("ui.expires_c78912caa7", { arg0: String(credential.expires_on) }) : ""}
            </p>
            {credential.status !== "pending" && credential.review_reason && (
              <p className="mt-2 text-xs text-muted-foreground">{uiText("ui.review_note_ae12b18a86")}{credential.review_reason}</p>
            )}
          </div>
        ))}
      </div>

      <form action={submit} className="space-y-4 border-t pt-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="credential_type">{uiText("ui.credential_type_9fb8bc82e6")}</Label>
            <select id="credential_type" name="credential_type" className={fieldClassName} defaultValue="ase">
              {(Object.entries(CREDENTIAL_TYPE_LABELS) as [CredentialType, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="credential_name">{uiText("ui.credential_name_911c43d9f0")}</Label>
            <Input id="credential_name" name="credential_name" required maxLength={120} placeholder={uiText("ui.ase_automobile_technician_9ef68e4167")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="issuer">{uiText("ui.issuer_39e02c46a0")}</Label>
            <Input id="issuer" name="issuer" required maxLength={120} placeholder={uiText("ui.national_institute_for_automotive_service_ex_bcf598ccc3")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scope">{uiText("ui.scope_b073f6c68e")}</Label>
            <Input id="scope" name="scope" maxLength={240} placeholder={uiText("ui.a1_a8_honda_electrical_diagnostics_08e31210ad")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="credential_identifier_last4">{uiText("ui.identifier_ending_c76307a33a")}</Label>
            <Input id="credential_identifier_last4" name="credential_identifier_last4" minLength={2} maxLength={8} placeholder={uiText("ui.last_4_only_3f86407b60")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="issued_on">{uiText("ui.issued_on_0167aecc6b")}</Label>
            <Input id="issued_on" name="issued_on" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expires_on">{uiText("ui.expires_on_71712ec2f7")}</Label>
            <Input id="expires_on" name="expires_on" type="date" />
          </div>
          {replaceable.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="supersedes_credential_id">{uiText("ui.replaces_an_approved_credential_6a6c165702")}</Label>
              <select id="supersedes_credential_id" name="supersedes_credential_id" className={fieldClassName} defaultValue="">
                <option value="">{uiText("ui.no_1ea442a134")}</option>
                {replaceable.map((credential) => (
                  <option key={credential.id} value={credential.id}>{credential.credential_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="evidence_reference">{uiText("ui.private_proof_or_issuer_lookup_instructions_7c0efc06bb")}</Label>
          <Textarea
            id="evidence_reference"
            name="evidence_reference"
            required
            maxLength={500}
            rows={3}
            placeholder={uiText("ui.secure_document_reference_registry_url_or_in_9f3ee62951")}
          />
        </div>
        <p className="text-xs text-muted-foreground">{uiText("ui.perfectppi_reviews_the_stated_record_and_sco_3d2207a6e4")}</p>
        {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
        <Button type="submit" disabled={saving}>{saving ? uiText("ui.submitting_64115d5b9c") : uiText("ui.submit_credential_for_review_bfb880daa8")}</Button>
      </form>
    </div>
  );
}
