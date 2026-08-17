"use client";

import { useEffect, useState } from "react";
import { useOutputs } from "@/features/outputs/hooks";
import { OutputGenerationStatus } from "@/components/shared/output-generation-status";
import { StandardizedOutputView } from "@/components/shared/standardized-output-view";
import { VscCoverageView } from "@/components/shared/vsc-coverage-view";
import type { StandardizedContent, VscCoverageData } from "@/types/api";

// ============================================================================
// The generated report and VSC determination, for whoever performed the
// inspection.
//
// The technician submits the work and — until now — had no way to see what came
// out of it; only the consumer dashboard rendered the outputs. That matters most
// for partner inspections, where the technician is expected to review the
// deliverables before pressing Send to DealerSpace.
//
// Resolves its own submission from the request id so it can drop into the
// existing client-rendered technician page without threading state through it.
// ============================================================================

export function InspectionResultsPanel({ requestId }: { requestId: string }) {
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolveSubmission() {
      try {
        const response = await fetch(`/api/ppi/submissions?request_id=${requestId}`);
        if (!response.ok) return;
        const body = await response.json();
        // The endpoint returns the current submission for the request.
        const current = Array.isArray(body.data) ? body.data[0] : body.data;
        if (!cancelled) setSubmissionId(current?.id ?? null);
      } finally {
        if (!cancelled) setResolving(false);
      }
    }

    resolveSubmission();
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const { standardized, vsc, loading } = useOutputs(submissionId);

  if (resolving || !submissionId) return null;

  const hasStandardized = Boolean(standardized);
  const hasVsc = Boolean(vsc);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="font-heading text-lg font-bold">Inspection Report</h2>
        {hasStandardized ? (
          <StandardizedOutputView
            content={standardized!.structured_content as unknown as StandardizedContent}
            generatedAt={standardized!.generated_at}
            documentUrl={
              standardized!.document_url ? `/api/outputs/${standardized!.id}/pdf` : null
            }
          />
        ) : (
          !loading && <OutputGenerationStatus submissionId={submissionId} />
        )}
      </div>

      {hasStandardized && (
        <div className="space-y-3">
          <h2 className="font-heading text-lg font-bold">VSC Coverage Determination</h2>
          {hasVsc ? (
            <VscCoverageView
              coverage={vsc!.coverage_data as unknown as VscCoverageData}
              generatedAt={vsc!.generated_at}
            />
          ) : (
            <OutputGenerationStatus submissionId={submissionId} waitFor="both" />
          )}
        </div>
      )}
    </div>
  );
}
