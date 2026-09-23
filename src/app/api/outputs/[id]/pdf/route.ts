import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiRole } from "@/features/auth/api";
import {
  generatePresignedGetUrl,
  isPrivateStorageReference,
  isStoredObjectConfigured,
} from "@/lib/storage/r2";
import { generateStandardizedReportPdf } from "@/lib/pdf/standardized-report-pdf";
import { renderReportV2Pdf } from "@/features/outputs/report-v2";
import type { StandardizedContent } from "@/types/api";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole([
    "consumer",
    "technician",
    "org_manager",
    "admin",
  ]);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  const supabase = auth.profile.role === "admin" ? createAdminClient() : auth.supabase;
  const { data: output } = await supabase
    .from("standardized_outputs")
    .select("document_url, structured_content, version, ppi_submission_id")
    .eq("id", id)
    .maybeSingle();

  if (!output) {
    return new NextResponse("Document not found", { status: 404 });
  }

  // Structured report content is enough to produce the same human-readable
  // PDF on demand. This keeps download available while private artifact upload
  // is delayed or not configured.
  if (!output.document_url && output.structured_content) {
    // Same version switch as the pipeline: outputs created with the redesign
    // render the two-page report; older outputs keep the legacy layout.
    const content = output.structured_content as unknown as StandardizedContent;
    if (content.report_v2?.status === "needs_review") {
      return new NextResponse("The report is being reviewed and is not available yet.", { status: 409 });
    }
    let pdf: Buffer;
    try {
      pdf = content.report_v2
        ? await renderReportV2Pdf(content.report_v2, { submissionId: output.ppi_submission_id, outputVersion: output.version })
        : generateStandardizedReportPdf(content);
    } catch (error) {
      console.error("[outputs/pdf] fallback render failed", error);
      return new NextResponse("The report is being reviewed and is not available yet.", { status: 409 });
    }
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="perfectppi-report-${id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (!output.document_url) {
    return new NextResponse("Document not found", { status: 404 });
  }

  if (!isStoredObjectConfigured(output.document_url)) {
    if (isPrivateStorageReference(output.document_url)) {
      return new NextResponse("Private document storage is not configured", { status: 503 });
    }
    // R2 not set up — redirect to the stored URL directly as fallback
    return NextResponse.redirect(output.document_url);
  }

  try {
    const signedUrl = await generatePresignedGetUrl(output.document_url, 3600);
    return NextResponse.redirect(signedUrl);
  } catch {
    return new NextResponse("Failed to generate document URL", { status: 500 });
  }
}
