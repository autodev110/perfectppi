import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isR2Configured, generatePresignedGetUrl } from "@/lib/storage/r2";
import { requireApiRole } from "@/features/auth/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "admin"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  const admin = createAdminClient();
  const { data: media } = await admin
    .from("ppi_media")
    .select("url")
    .eq("id", id)
    .maybeSingle();

  if (!media?.url) {
    return new NextResponse("Media not found", { status: 404 });
  }

  if (!isR2Configured()) {
    return NextResponse.redirect(media.url);
  }

  try {
    const signedUrl = await generatePresignedGetUrl(media.url, 3600);
    return NextResponse.redirect(signedUrl);
  } catch {
    return new NextResponse("Failed to generate media URL", { status: 500 });
  }
}
