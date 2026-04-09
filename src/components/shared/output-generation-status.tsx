"use client";

import { useOutputGeneration, useOutputs } from "@/features/outputs/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface OutputGenerationStatusProps {
  submissionId: string;
  onReady?: () => void;
  waitFor?: "standardized" | "both";
}

export function OutputGenerationStatus({
  submissionId,
  onReady,
  waitFor = "standardized",
}: OutputGenerationStatusProps) {
  const router = useRouter();
  const readyHandledRef = useRef(false);
  const { status, error, generate } = useOutputGeneration(submissionId);
  const { standardized, vsc, loading: outputsLoading, refetch } = useOutputs(submissionId);
  const hasRequiredOutputs =
    waitFor === "both" ? Boolean(standardized && vsc) : Boolean(standardized);
  const outputLabel =
    waitFor === "both" ? "inspection outputs" : "inspection report";

  // Poll while waiting for outputs generated server-side
  useEffect(() => {
    if (outputsLoading || hasRequiredOutputs || status === "error") return;

    const timer = setInterval(() => {
      void refetch();
    }, 2500);

    return () => clearInterval(timer);
  }, [outputsLoading, hasRequiredOutputs, status, refetch]);

  // When outputs appear, refresh the server-rendered page sections
  useEffect(() => {
    if (outputsLoading || !hasRequiredOutputs || readyHandledRef.current) return;

    readyHandledRef.current = true;
    onReady?.();
    router.refresh();
  }, [outputsLoading, hasRequiredOutputs, onReady, router]);

  // Poll for outputs when generating
  useEffect(() => {
    if (status !== "complete") return;

    const timer = setTimeout(async () => {
      await refetch();
      onReady?.();
      router.refresh();
    }, 1000);

    return () => clearTimeout(timer);
  }, [status, refetch, onReady, router]);

  // Outputs already exist
  if (!outputsLoading && hasRequiredOutputs) {
    return null;
  }

  // Loading initial check
  if (outputsLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center">
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">
            Checking for reports...
          </p>
        </CardContent>
      </Card>
    );
  }

  // Waiting for background generation (submit route trigger)
  if (status === "idle") {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
          <p className="text-sm font-medium mt-3">
            Generating {outputLabel}...
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            If this takes too long, you can trigger regeneration manually.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={generate}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Regenerate Now
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Generating
  if (status === "generating") {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
          <p className="text-sm font-medium mt-3">
            Generating {outputLabel}...
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This may take a moment while AI analyzes the inspection data.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Complete
  if (status === "complete") {
    return (
      <Card className="border-dashed border-emerald-200 bg-emerald-50/50">
        <CardContent className="py-6 text-center">
          <CheckCircle2 className="h-5 w-5 mx-auto text-emerald-600" />
          <p className="text-sm font-medium text-emerald-700 mt-2">
            Report generated successfully
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Refreshing...
          </p>
        </CardContent>
      </Card>
    );
  }

  // Error
  if (status === "error") {
    return (
      <Card className="border-dashed border-red-200 bg-red-50/50">
        <CardContent className="py-6 text-center">
          <AlertCircle className="h-5 w-5 mx-auto text-red-500" />
          <p className="text-sm font-medium text-red-700 mt-2">
            Failed to generate report
          </p>
          {error && (
            <p className="text-xs text-red-600 mt-1">{error}</p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={generate}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}
