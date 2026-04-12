import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isR2Configured, generatePresignedGetUrl } from "@/lib/storage/r2";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const admin = createAdminClient();
  const { data: output } = await admin
    .from("standardized_outputs")
    .select("document_url")
    .eq("id", id)
    .maybeSingle();

  if (!output?.document_url) {
    return new NextResponse("Document not found", { status: 404 });
  }

  if (!isR2Configured()) {
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
