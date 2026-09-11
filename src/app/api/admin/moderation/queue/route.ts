import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getModerationCapabilities } from "@/features/moderation/capabilities";
import { getModerationQueue } from "@/features/moderation/queries";

// GET /api/admin/moderation/queue — media awaiting review for the iOS admin
// screen. Needs the queue_read grant (plan 18.1); the admin role alone sees
// nothing. Previews come from /api/moderation/media/<entity_id>.
export async function GET() {
  const auth = await requireApiRole(["admin"]);
  if ("response" in auth) return auth.response;
  const capabilities = await getModerationCapabilities(auth.profile.id);
  if (!capabilities.has("queue_read")) {
    return NextResponse.json(
      { error: "The queue_read moderation capability is required.", code: "capability_required" },
      { status: 403 },
    );
  }
  const items = (await getModerationQueue("pending_review"))
    .filter((item) => item.entity_type === "community_post_media" || item.entity_type === "vehicle_media")
    .map((item) => {
      const author = Array.isArray(item.author) ? item.author[0] : item.author;
      return {
        id: item.id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        status: item.status,
        risk_level: item.risk_level,
        reason_codes: item.reason_codes,
        content_preview: item.content_preview,
        media_type: item.media?.media_type ?? null,
        created_at: item.created_at,
        author: author ? { id: author.id, display_name: author.display_name, username: author.username } : null,
        scanner_not_configured: item.reason_codes.includes("specialist_scan_not_configured"),
      };
    });
  return NextResponse.json(
    {
      data: {
        items,
        canDecide: capabilities.has("content_decide"),
        scannerNotConfigured: items.some((item) => item.scanner_not_configured),
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
