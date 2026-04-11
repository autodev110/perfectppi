import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { createShareLink } from "@/features/media/actions";
import { z } from "zod";

const shareSchema = z.object({
  targetType: z.enum(["media_package", "inspection_result", "standardized_output"]),
  targetId: z.string().uuid(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

// POST /api/share — generate a share link token for a target resource
export async function POST(req: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = shareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await createShareLink(parsed.data);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
