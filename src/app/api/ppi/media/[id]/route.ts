import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isR2Configured, getObjectFromStoredUrl } from "@/lib/storage/r2";
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
    // Local/dev without R2 — redirect to whatever URL was stored.
    return NextResponse.redirect(media.url);
  }

  try {
    const object = await getObjectFromStoredUrl(media.url);
    const headers = new Headers({
      "Content-Type": object.contentType,
      "Cache-Control": "private, max-age=300",
    });
    if (object.contentLength != null) {
      headers.set("Content-Length", String(object.contentLength));
    }
    if (object.etag) headers.set("ETag", object.etag);

    return new NextResponse(object.body, { status: 200, headers });
  } catch (err) {
    console.error("[ppi/media] failed to fetch object", {
      id,
      url: media.url,
      err: err instanceof Error ? err.message : String(err),
    });
    return new NextResponse("Failed to load media", { status: 500 });
  }
}
