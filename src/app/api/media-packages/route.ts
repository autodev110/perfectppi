import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { getMyPackages } from "@/features/media/queries";
import { createMediaPackage } from "@/features/media/actions";
import { z } from "zod";

const itemSchema = z.object({
  type: z.enum(["image", "video", "file"]),
  url: z.string().url(),
  name: z.string().optional(),
});

const createSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  ppiSubmissionId: z.string().uuid().optional(),
  items: z.array(itemSchema).min(1),
});

// GET /api/media-packages — list media packages for authenticated user
export async function GET() {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const data = await getMyPackages();
  return NextResponse.json({ data });
}

// POST /api/media-packages — create a new media package
export async function POST(req: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await createMediaPackage(parsed.data);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}
