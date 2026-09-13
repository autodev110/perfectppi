import { NextResponse } from "next/server";
import { z } from "zod";
import { claimVehicleHandoff } from "@/features/vehicles/handoff";

const inputSchema = z.object({
  code: z.string(),
  vin: z.string(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the claim code and full VIN." }, { status: 400 });
  }

  const result = await claimVehicleHandoff(parsed.data);
  if (result.error) {
    const status = result.code === "not_authenticated" ? 401
      : result.code === "rate_limited" ? 429
        : result.code === "duplicate_vin" ? 409
          : 400;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }
  return NextResponse.json(result.data, { status: 201 });
}
