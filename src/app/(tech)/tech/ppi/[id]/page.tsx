"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { acceptRequest } from "@/features/ppi/actions";
import { PpiStatusBadge } from "@/components/shared/ppi-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, User, Calendar, ChevronLeft, AlertCircle } from "lucide-react";
import { DealerSpaceInspectionPanel } from "@/components/shared/dealerspace-inspection-panel";
import { InspectionResultsPanel } from "@/components/shared/inspection-results-panel";
import { SourceBadge } from "@/components/shared/source-badge";
import Link from "next/link";
import { inspectionDisplayName } from "@/features/ppi/presentation";
import { INSPECTION_SCOPE_LABELS } from "@/features/ppi/constants";
import type { InspectionScope } from "@/types/enums";

import { useTranslator } from "@/lib/i18n/client";

interface RequestDetail {
  id: string;
  ppi_type: string;
  inspection_scope?: InspectionScope;
  status: string;
  whose_car: string;
  requester_role: string;
  created_at: string;
  source_system?: string | null;
  vehicle: {
    year: number | null;
    make: string | null;
    model: string | null;
    trim: string | null;
    vin: string | null;
    mileage: number | null;
  } | null;
  requester: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export default function TechInspectionDetailPage() {
  const uiText = useTranslator();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/ppi/requests/${id}`);
      if (res.ok) {
        const { data } = await res.json();
        setRequest(data);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    const result = await acceptRequest(id);
    if ("error" in result) {
      setError(result.error ?? uiText("ui.unknown_error_27c2ccd962"));
      setAccepting(false);
      return;
    }
    router.push(`/tech/ppi/${id}/inspect?sub=${result.data?.submissionId}`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <p className="text-muted-foreground">{uiText("ui.request_not_found_bb08e04092")}</p>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/tech/ppi">{uiText("ui.back_to_queue_1be6ee3fc9")}</Link>
        </Button>
      </div>
    );
  }

  const inspectionName = inspectionDisplayName(
    request.vehicle,
    request.ppi_type,
    request.created_at
  );

  const canAccept = request.status === "assigned";
  const canInspect = ["accepted", "in_progress"].includes(request.status);
  const isSubmitted = ["submitted", "completed"].includes(request.status);
  const canEdit = isSubmitted;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/tech/ppi" aria-label={uiText("ui.back_to_inspection_queue_b780d80849")}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-xl font-bold">{inspectionName}</h1>
            <SourceBadge sourceSystem={request.source_system} />
          </div>
          <PpiStatusBadge status={request.status as "draft" | "pending_assignment" | "assigned" | "accepted" | "in_progress" | "submitted" | "needs_revision" | "completed" | "archived"} />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive font-medium">{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Car className="h-4 w-4" />{uiText("ui.vehicle_details_26dd95425e")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">{uiText("ui.inspection_6e4fa13da4")}</p>
            <p className="font-medium">
              {INSPECTION_SCOPE_LABELS[request.inspection_scope ?? "complete"]}
            </p>
          </div>
          {request.vehicle?.vin && (
            <div>
              <p className="text-muted-foreground text-xs">{uiText("ui.vin_5e0211b12d")}</p>
              <p className="font-mono font-medium text-xs">{request.vehicle.vin}</p>
            </div>
          )}
          {request.vehicle?.mileage && (
            <div>
              <p className="text-muted-foreground text-xs">{uiText("ui.mileage_ffe44a0179")}</p>
              <p className="font-medium">{request.vehicle.mileage.toLocaleString()}{uiText("ui.mi_3074dbe604")}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs">{uiText("ui.whose_car_75614f1bb0")}</p>
            <p className="font-medium capitalize">{request.whose_car}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">{uiText("ui.request_type_50365e0bf8")}</p>
            <p className="font-medium capitalize">{request.requester_role}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />{uiText("ui.requester_a374bf6170")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="font-medium">
            {request.requester?.display_name ??
              (request.source_system === "dealerspace" ? uiText("ui.dealership_a761f63f29") : uiText("ui.consumer_3fdb185870"))}
          </p>
          <p className="text-muted-foreground flex items-center gap-1 mt-1">
            <Calendar className="h-3.5 w-3.5" />{uiText("ui.requested_2d9e28289f")}{" "}
            {new Date(request.created_at).toLocaleDateString(uiText("ui.en_us_5c49f88daf"), {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </CardContent>
      </Card>

      <DealerSpaceInspectionPanel requestId={id} />

      {/* Actions */}
      {canAccept && (
        <Button onClick={handleAccept} disabled={accepting} className="w-full h-12 font-bold">
          {accepting ? uiText("ui.accepting_a168fd64e9") : uiText("ui.accept_begin_inspection_03f3c6c4bf")}
        </Button>
      )}

      {canInspect && (
        <Button asChild className="w-full h-12 font-bold">
          <Link href={`/tech/ppi/${id}/inspect`}>
            {request.status === "in_progress" ? uiText("ui.continue_inspection_05f0b20679") : uiText("ui.begin_inspection_48623433af")}
          </Link>
        </Button>
      )}

      {canEdit && (
        <Button variant="outline" asChild className="w-full h-12 font-bold">
          <Link href={`/tech/ppi/${id}/edit`}>{uiText("ui.edit_resubmit_250add2f69")}</Link>
        </Button>
      )}

      {isSubmitted && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
          <p className="text-emerald-800 font-semibold">{uiText("ui.inspection_submitted_86f635ff98")}</p>
          <p className="text-emerald-700 text-sm mt-1">{uiText("ui.the_requester_has_been_notified_c995f1eb73")}</p>
        </div>
      )}

      {/* Review the generated deliverables here before sending them anywhere. */}
      {isSubmitted && <InspectionResultsPanel requestId={id} />}
    </div>
  );
}
