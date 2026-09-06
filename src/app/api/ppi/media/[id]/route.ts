import { type NextRequest, NextResponse } from "next/server";
import {
  isPrivateStorageReference,
  isStoredObjectConfigured,
  getObjectFromStoredUrl,
} from "@/lib/storage/r2";
import { requireApiRole } from "@/features/auth/api";
import { deletePpiMedia } from "@/features/ppi/actions";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "admin", "org_manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  const { data: media, error } = await auth.supabase
    .from("ppi_media")
    .select("url")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[ppi/media] DB lookup failed", { id, error });
    return NextResponse.json(
      { error: "Media lookup failed" },
      { status: 500 }
    );
  }

  if (!media?.url) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  if (!isStoredObjectConfigured(media.url)) {
    if (isPrivateStorageReference(media.url)) {
      return NextResponse.json({ error: "Private media storage is unavailable" }, { status: 503 });
    }
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

    const blob = new Blob([new Uint8Array(object.bytes)], {
      type: object.contentType,
    });
    return new NextResponse(blob, { status: 200, headers });
  } catch (err) {
    console.error("[ppi/media] failed to fetch object", {
      id,
      error: err instanceof Error ? err.name : "unknown",
    });
    // Surface the underlying error to the client so it shows up in the browser
    // network tab without needing access to server logs. (No secrets included.)
    return NextResponse.json(
      {
        error: "Failed to load media",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/ppi/media/[id] — remove an inspection photo the caller captured.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiRole(["consumer", "technician", "admin", "org_manager"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const result = await deletePpiMedia(id);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data });
}
