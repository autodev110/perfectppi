import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { getVehicleBuildSubscription, setVehicleBuildSubscription } from "@/features/saved/collections";

const roles = ["consumer", "technician", "org_manager", "admin"] as const;
const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({ subscribed: z.boolean() });
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid vehicle" }, { status: 400 });
  const subscribed = await getVehicleBuildSubscription(auth.profile.id, parsed.data.id);
  return NextResponse.json({ data: { subscribed } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireApiRole([...roles]);
  if ("response" in auth) return auth.response;
  const parsedParams = paramsSchema.safeParse(await params);
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !parsedBody.success) return NextResponse.json({ error: "Invalid subscription request" }, { status: 400 });
  try {
    const subscribed = await setVehicleBuildSubscription(auth.profile.id, parsedParams.data.id, parsedBody.data.subscribed);
    return NextResponse.json({ data: { subscribed } });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "42501") return NextResponse.json({ error: "This vehicle is not available for build updates" }, { status: 404 });
    if (code === "54000") return NextResponse.json({ error: "You can subscribe to up to 200 vehicle builds" }, { status: 409 });
    return NextResponse.json({ error: "Your build subscription could not be updated" }, { status: 500 });
  }
}
