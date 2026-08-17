import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiRole } from "@/features/auth/api";
import {
  generatePresignedGetUrl,
  isPrivateStorageReference,
  isStoredObjectConfigured,
} from "@/lib/storage/r2";

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
    .select("document_url")
    .eq("id", id)
    .maybeSingle();

  if (!output?.document_url) {
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
