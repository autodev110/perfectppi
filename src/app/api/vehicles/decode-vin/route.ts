import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { decodeVinDetails } from "@/lib/vehicles/vin-decoder";

const schema = z.object({
  vin: z.string().trim().min(1).max(32),
  modelYear: z.number().int().min(1900).max(2100).optional().nullable(),
});

export async function POST(request: Request) {
  const auth = await requireApiRole([
    "consumer",
    "technician",
    "org_manager",
    "admin",
  ]);
  if ("response" in auth) return auth.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "VIN is required" },
      { status: 400 }
    );
  }

  try {
    const decoded = await decodeVinDetails(parsed.data.vin, parsed.data.modelYear);
    if (!decoded) {
      return NextResponse.json(
        { error: "Enter a valid 17-character VIN" },
        { status: 422 }
      );
    }
    return NextResponse.json({ data: decoded });
  } catch {
    return NextResponse.json(
      { error: "VIN decoder is temporarily unavailable" },
      { status: 502 }
    );
  }
}
