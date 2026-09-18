"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { t as uiText } from "@/lib/i18n";
import { useTranslator } from "@/lib/i18n/client";

type PrivacyRequest = {
  id: string;
  request_type: string;
  status: string;
};

type Identity = { id: string; provider: string };

const requestTypes = [
  ["access", uiText("ui.access_my_data_95157e99f7")],
  ["correction", uiText("ui.correct_my_data_4324cca491")],
  ["opt_out", uiText("ui.privacy_opt_out_868ae136f4")],
  ["appeal", uiText("ui.appeal_a_privacy_decision_f433c4ef0a")],
] as const;

export function PrivacyCenter() {
  const uiText = useTranslator();
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [requestType, setRequestType] = useState<(typeof requestTypes)[number][0]>("access");
  const [details, setDetails] = useState("");
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);

  async function load() {
    const [requestResponse, identityResponse, analyticsResponse] = await Promise.all([
      fetch("/api/privacy/requests", { cache: "no-store" }),
      fetch("/api/account/identities", { cache: "no-store" }),
      fetch("/api/privacy/analytics", { cache: "no-store" }),
    ]);

    if (requestResponse.ok) {
      const body = await requestResponse.json();
      setRequests(body.data ?? []);
    }
    if (identityResponse.ok) {
      const body = await identityResponse.json();
      setIdentities(body.data ?? []);
    }
    if (analyticsResponse.ok) {
      const body = await analyticsResponse.json();
      setAnalyticsEnabled(body.enabled === true);
      setAnalyticsLoaded(true);
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
      ? body.message ?? uiText("ui.request_submitted_b170085590")
      : body.error ?? uiText("ui.request_could_not_be_submitted_6bc6e41b61"));
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
      body: JSON.stringify({ provider: uiText("ui.google_bbdefa2950") }),
    });
    const body = await response.json().catch(() => ({}));
    setMessage(response.ok ? uiText("ui.google_was_disconnected_a969b8ae80") : body.error ?? uiText("ui.google_could_not_be_disconnected_deea71846c"));
    if (response.ok) await load();
    setWorking(false);
  }

  async function setAnalyticsPreference(enabled: boolean) {
    setWorking(true);
    setMessage(null);
    const response = await fetch("/api/privacy/analytics", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      setAnalyticsEnabled(body.enabled === true);
      setMessage(enabled
        ? uiText("ui.product_analytics_is_enabled_95633e61ef")
        : uiText("ui.product_analytics_is_disabled_and_your_exist_c4f9827831"));
    } else {
      setMessage(body.error ?? uiText("ui.analytics_preference_could_not_be_saved_5e511a2da5"));
    }
    setWorking(false);
  }

  const hasGoogle = identities.some((identity) => identity.provider === "google");

  return (
    <Card>
      <CardHeader><CardTitle>{uiText("ui.privacy_account_3f19ac8fe8")}</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>{uiText("ui.request_access_export_correction_opt_out_app_0f74e000ec")}</p>
          <p>
            <Link href="/privacy" className="font-medium text-accent underline">{uiText("ui.privacy_policy_506ff39462")}</Link>
            {" · "}<Link href="/privacy-choices" className="font-medium text-accent underline">{uiText("ui.privacy_choices_174105e93f")}</Link>
            {" · "}<Link href="/terms" className="font-medium text-accent underline">{uiText("ui.terms_ede5489964")}</Link>
          </p>
        </div>

        <div className="space-y-3">
          <div className="rounded-md border p-4">
            <h3 className="text-sm font-semibold">{uiText("ui.download_your_data_fdbb4b35c4")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{uiText("ui.create_an_authenticated_json_export_of_your__49059a7476")}</p>
            <Button asChild variant="outline" className="mt-3">
              <a href="/api/privacy/export" download>{uiText("ui.download_my_data_5c4238f6a8")}</a>
            </Button>
          </div>

          <Label htmlFor="privacy-request-type">{uiText("ui.request_type_6db8df2da9")}</Label>
          <select
            id="privacy-request-type"
            value={requestType}
            onChange={(event) => setRequestType(event.target.value as typeof requestType)}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          >
            {requestTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <Label htmlFor="privacy-request-details">{uiText("ui.details_optional_4239d7e46a")}</Label>
          <Textarea
            id="privacy-request-details"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder={uiText("ui.tell_us_what_you_need_do_not_include_passwor_1c385fb3bd")}
          />
          <Button disabled={working} onClick={() => submitRequest(requestType)}>{uiText("ui.submit_privacy_request_0b54e3291d")}</Button>
        </div>

        {requests.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{uiText("ui.recent_requests_b83a589f11")}</h3>
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
            <h3 className="text-sm font-semibold">{uiText("ui.connected_sign_in_methods_feb3314289")}</h3>
            <p className="text-sm text-muted-foreground">{uiText("ui.google_can_be_disconnected_only_when_another_827d5e44ff")}</p>
            <Button variant="outline" disabled={working} onClick={disconnectGoogle}>{uiText("ui.disconnect_google_1f4e6793ca")}</Button>
          </div>
        )}

        <div className="space-y-3 border-t pt-5">
          <div className="flex items-start gap-3">
            <input
              id="usage-analytics-enabled"
              type="checkbox"
              checked={analyticsEnabled}
              disabled={working || !analyticsLoaded}
              onChange={(event) => void setAnalyticsPreference(event.target.checked)}
              className="mt-1 h-5 w-5 rounded border-input accent-accent"
            />
            <div>
              <Label htmlFor="usage-analytics-enabled">{uiText("ui.share_product_usage_analytics_dd776f8d5f")}</Label>
              <p className="mt-1 text-sm text-muted-foreground">{uiText("ui.help_improve_perfectppi_with_coarse_action_c_42bdec3d1e")}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t pt-5">
          <h3 className="text-sm font-semibold text-destructive">{uiText("ui.delete_account_a2e20a3357")}</h3>
          <p className="text-sm text-muted-foreground">{uiText("ui.this_schedules_permanent_account_deletion_it_a70e5cd754")}</p>
          <Label htmlFor="delete-confirmation">{uiText("ui.type_delete_to_confirm_d4856f418b")}</Label>
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
          >{uiText("ui.request_account_deletion_29ac7e6d5b")}</Button>
        </div>

        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
