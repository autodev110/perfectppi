"use client";

import { useEffect, useState } from "react";
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

const fieldClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm";

function statusLabel(status: string) {
  if (status === "approved") return "Reviewed and active";
  if (status === "rejected") return "Not approved";
  if (status === "revoked") return "Revoked";
  return "Awaiting review";
}

export function TechnicianCredentialManager() {
  const [credentials, setCredentials] = useState<TechnicianCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/technicians/me/credentials", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Credentials could not be loaded.");
      setCredentials(body.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Credentials could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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
      if (!response.ok) throw new Error(body.error ?? "Credential could not be submitted.");
      setMessage("Credential submitted for Trust & Safety review.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Credential could not be submitted.");
    } finally {
      setSaving(false);
    }
  }

  const replaceable = credentials.filter((credential) => credential.status === "approved");

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Loading credentials...</p>}
        {!loading && credentials.length === 0 && (
          <p className="text-sm text-muted-foreground">No credentials have been submitted.</p>
        )}
        {credentials.map((credential) => (
          <div key={credential.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{credential.credential_name}</p>
              <span className="text-xs font-medium text-muted-foreground">{statusLabel(credential.status)}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {credentialTypeLabel(credential.credential_type)} · {credential.issuer}
              {credential.expires_on ? ` · expires ${credential.expires_on}` : ""}
            </p>
            {credential.status !== "pending" && credential.review_reason && (
              <p className="mt-2 text-xs text-muted-foreground">Review note: {credential.review_reason}</p>
            )}
          </div>
        ))}
      </div>

      <form action={submit} className="space-y-4 border-t pt-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="credential_type">Credential type</Label>
            <select id="credential_type" name="credential_type" className={fieldClassName} defaultValue="ase">
              {(Object.entries(CREDENTIAL_TYPE_LABELS) as [CredentialType, string][]).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="credential_name">Credential name</Label>
            <Input id="credential_name" name="credential_name" required maxLength={120} placeholder="ASE Automobile Technician" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="issuer">Issuer</Label>
            <Input id="issuer" name="issuer" required maxLength={120} placeholder="National Institute for Automotive Service Excellence" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scope">Scope</Label>
            <Input id="scope" name="scope" maxLength={240} placeholder="A1-A8, Honda, electrical diagnostics" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="credential_identifier_last4">Identifier ending</Label>
            <Input id="credential_identifier_last4" name="credential_identifier_last4" minLength={2} maxLength={8} placeholder="Last 4 only" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="issued_on">Issued on</Label>
            <Input id="issued_on" name="issued_on" type="date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expires_on">Expires on</Label>
            <Input id="expires_on" name="expires_on" type="date" />
          </div>
          {replaceable.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="supersedes_credential_id">Replaces an approved credential</Label>
              <select id="supersedes_credential_id" name="supersedes_credential_id" className={fieldClassName} defaultValue="">
                <option value="">No</option>
                {replaceable.map((credential) => (
                  <option key={credential.id} value={credential.id}>{credential.credential_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="evidence_reference">Private proof or issuer lookup instructions</Label>
          <Textarea
            id="evidence_reference"
            name="evidence_reference"
            required
            maxLength={500}
            rows={3}
            placeholder="Secure document reference, registry URL, or instructions for confirming with the issuer. This is never shown publicly."
          />
        </div>
        <p className="text-xs text-muted-foreground">
          PerfectPPI reviews the stated record and scope. Submission does not guarantee approval or endorse your services.
        </p>
        {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
        <Button type="submit" disabled={saving}>{saving ? "Submitting..." : "Submit credential for review"}</Button>
      </form>
    </div>
  );
}
