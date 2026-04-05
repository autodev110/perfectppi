"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { acceptRequest } from "@/features/ppi/actions";
import { PpiStatusBadge } from "@/components/shared/ppi-status-badge";
import { PpiBadge } from "@/components/shared/ppi-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, User, Calendar, ChevronLeft, AlertCircle } from "lucide-react";
import Link from "next/link";

interface RequestDetail {
  id: string;
  ppi_type: string;
  status: string;
  whose_car: string;
  requester_role: string;
  created_at: string;
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
      setError(result.error ?? "Unknown error");
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
        <p className="text-muted-foreground">Request not found</p>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/tech/ppi">Back to Queue</Link>
        </Button>
      </div>
    );
  }

  const vehicleName = request.vehicle
    ? [request.vehicle.year, request.vehicle.make, request.vehicle.model, request.vehicle.trim]
        .filter(Boolean)
        .join(" ")
    : "Unknown Vehicle";

  const canAccept = request.status === "assigned";
  const canInspect = ["accepted", "in_progress"].includes(request.status);
  const isSubmitted = ["submitted", "completed"].includes(request.status);
  const canEdit = isSubmitted;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/tech/ppi">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-xl font-bold">{vehicleName}</h1>
            <PpiBadge type={request.ppi_type as "personal" | "general_tech" | "certified_tech"} />
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
            <Car className="h-4 w-4" /> Vehicle Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          {request.vehicle?.vin && (
            <div>
              <p className="text-muted-foreground text-xs">VIN</p>
              <p className="font-mono font-medium text-xs">{request.vehicle.vin}</p>
            </div>
          )}
          {request.vehicle?.mileage && (
            <div>
              <p className="text-muted-foreground text-xs">Mileage</p>
              <p className="font-medium">{request.vehicle.mileage.toLocaleString()} mi</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs">Whose Car</p>
            <p className="font-medium capitalize">{request.whose_car}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Request Type</p>
            <p className="font-medium capitalize">{request.requester_role}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" /> Requester
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p className="font-medium">
            {request.requester?.display_name ?? "Consumer"}
          </p>
          <p className="text-muted-foreground flex items-center gap-1 mt-1">
            <Calendar className="h-3.5 w-3.5" />
            Requested{" "}
            {new Date(request.created_at).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </CardContent>
      </Card>

      {/* Actions */}
      {canAccept && (
        <Button onClick={handleAccept} disabled={accepting} className="w-full h-12 font-bold">
          {accepting ? "Accepting…" : "Accept & Begin Inspection"}
        </Button>
      )}

      {canInspect && (
        <Button asChild className="w-full h-12 font-bold">
          <Link href={`/tech/ppi/${id}/inspect`}>
            {request.status === "in_progress" ? "Continue Inspection" : "Begin Inspection"}
          </Link>
        </Button>
      )}

      {canEdit && (
        <Button variant="outline" asChild className="w-full h-12 font-bold">
          <Link href={`/tech/ppi/${id}/edit`}>Edit & Resubmit</Link>
        </Button>
      )}

      {isSubmitted && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
          <p className="text-emerald-800 font-semibold">Inspection submitted.</p>
          <p className="text-emerald-700 text-sm mt-1">The requester has been notified.</p>
        </div>
      )}
    </div>
  );
}
