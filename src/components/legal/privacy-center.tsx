"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PrivacyRequest = {
  id: string;
  request_type: string;
  status: string;
};

type Identity = { id: string; provider: string };

const requestTypes = [
  ["access", "Access my data"],
  ["correction", "Correct my data"],
  ["opt_out", "Privacy opt-out"],
  ["appeal", "Appeal a privacy decision"],
] as const;

export function PrivacyCenter() {
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [requestType, setRequestType] = useState<(typeof requestTypes)[number][0]>("access");
  const [details, setDetails] = useState("");
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [requestResponse, identityResponse] = await Promise.all([
      fetch("/api/privacy/requests", { cache: "no-store" }),
      fetch("/api/account/identities", { cache: "no-store" }),
    ]);

    if (requestResponse.ok) {
      const body = await requestResponse.json();
      setRequests(body.data ?? []);
    }
    if (identityResponse.ok) {
      const body = await identityResponse.json();
      setIdentities(body.data ?? []);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submitRequest(type: string, confirmation?: string) {
    setWorking(true);
    setMessage(null);
    const response = await fetch("/api/privacy/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestType: type,
        details: details.trim() || undefined,
        deletionConfirmation: confirmation,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok
      ? body.message ?? "Request submitted."
      : body.error ?? "Request could not be submitted.");
    if (response.ok) {
      setDetails("");
      setDeletionConfirmation("");
      await load();
    }
    setWorking(false);
  }

  async function disconnectGoogle() {
    setWorking(true);
    setMessage(null);
    const response = await fetch("/api/account/identities", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "google" }),
    });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Google was disconnected." : body.error ?? "Google could not be disconnected.");
    if (response.ok) await load();
    setWorking(false);
  }

  const hasGoogle = identities.some((identity) => identity.provider === "google");

  return (
    <Card>
      <CardHeader><CardTitle>Privacy & Account</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Request access, export, correction, opt-out, appeal, or account deletion. We may verify your identity before completing a request.</p>
          <p>
            <Link href="/privacy" className="font-medium text-accent underline">Privacy Policy</Link>
            {" · "}<Link href="/privacy-choices" className="font-medium text-accent underline">Privacy Choices</Link>
            {" · "}<Link href="/terms" className="font-medium text-accent underline">Terms</Link>
          </p>
        </div>

        <div className="space-y-3">
          <div className="rounded-md border p-4">
            <h3 className="text-sm font-semibold">Download your data</h3>
            <p className="mt-1 text-sm text-muted-foreground">Create an authenticated JSON export of your account, inspections, vehicles, posts, messages, and related records.</p>
            <Button asChild variant="outline" className="mt-3">
              <a href="/api/privacy/export" download>Download My Data</a>
            </Button>
          </div>

          <Label htmlFor="privacy-request-type">Request type</Label>
          <select
            id="privacy-request-type"
            value={requestType}
            onChange={(event) => setRequestType(event.target.value as typeof requestType)}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          >
            {requestTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <Label htmlFor="privacy-request-details">Details (optional)</Label>
          <Textarea
            id="privacy-request-details"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Tell us what you need. Do not include passwords or payment details."
          />
          <Button disabled={working} onClick={() => submitRequest(requestType)}>Submit Privacy Request</Button>
        </div>

        {requests.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Recent requests</h3>
            {requests.slice(0, 5).map((request) => (
              <div key={request.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <span>{request.request_type.replaceAll("_", " ")}</span>
                <span className="text-muted-foreground">{request.status.replaceAll("_", " ")}</span>
              </div>
            ))}
          </div>
        )}

        {hasGoogle && (
          <div className="space-y-2 border-t pt-5">
            <h3 className="text-sm font-semibold">Connected sign-in methods</h3>
            <p className="text-sm text-muted-foreground">Google can be disconnected only when another sign-in method is available, so you cannot lock yourself out.</p>
            <Button variant="outline" disabled={working} onClick={disconnectGoogle}>Disconnect Google</Button>
          </div>
        )}

        <div className="space-y-3 border-t pt-5">
          <h3 className="text-sm font-semibold text-destructive">Delete account</h3>
          <p className="text-sm text-muted-foreground">This schedules permanent account deletion. It normally begins within 24 hours; processing pauses only where a documented legal preservation hold applies.</p>
          <Label htmlFor="delete-confirmation">Type DELETE to confirm</Label>
          <input
            id="delete-confirmation"
            value={deletionConfirmation}
            onChange={(event) => setDeletionConfirmation(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
          <Button
            variant="destructive"
            disabled={working || deletionConfirmation !== "DELETE"}
            onClick={() => submitRequest("deletion", deletionConfirmation)}
          >
            Request Account Deletion
          </Button>
        </div>

        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
