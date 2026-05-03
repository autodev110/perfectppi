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
  const { data: media, error } = await admin
    .from("ppi_media")
    .select("url")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[ppi/media] DB lookup failed", { id, error });
    return new NextResponse("Media lookup failed", { status: 500 });
  }

  if (!media?.url) {
    console.warn("[ppi/media] media row not found", { id });
    return new NextResponse("Media not found", { status: 404 });
  }

  if (!isR2Configured()) {
    console.warn("[ppi/media] R2 not configured, redirecting to raw URL", {
      id,
      url: media.url,
    });
    return NextResponse.redirect(media.url);
  }

  try {
    const signedUrl = await generatePresignedGetUrl(media.url, 3600);
    return NextResponse.redirect(signedUrl, { status: 307 });
  } catch (err) {
    console.error("[ppi/media] failed to sign URL", { id, url: media.url, err });
    return new NextResponse("Failed to generate media URL", { status: 500 });
  }
}
