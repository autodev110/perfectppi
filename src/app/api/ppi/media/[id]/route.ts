import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isR2Configured,
  getObjectFromStoredUrl,
  extractKeyFromStoredUrl,
} from "@/lib/storage/r2";
import { requireApiRole } from "@/features/auth/api";

export const runtime = "nodejs";

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
    return NextResponse.json(
      { error: "Media lookup failed", detail: error.message },
      { status: 500 }
    );
  }

  if (!media?.url) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  if (!isR2Configured()) {
    // Local/dev without R2 — redirect to whatever URL was stored.
    return NextResponse.redirect(media.url);
  }

  try {
    const object = await getObjectFromStoredUrl(media.url);
    const headers = new Headers({
      "Content-Type": object.contentType,
      "Content-Length": String(object.bytes.byteLength),
      "Cache-Control": "private, max-age=300",
    });
    if (object.etag) headers.set("ETag", object.etag);

    return new NextResponse(object.bytes, { status: 200, headers });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : undefined;
    console.error("[ppi/media] failed to fetch object", {
      id,
      url: media.url,
      key: extractKeyFromStoredUrl(media.url),
      bucket: process.env.R2_BUCKET_NAME,
      hasEndpoint: Boolean(process.env.R2_ENDPOINT),
      errName,
      detail,
    });
    // Surface the underlying error to the client so it shows up in the browser
    // network tab without needing access to server logs. (No secrets included.)
    return NextResponse.json(
      {
        error: "Failed to load media",
        errName,
        detail,
        key: extractKeyFromStoredUrl(media.url),
      },
      { status: 500 }
    );
  }
}
