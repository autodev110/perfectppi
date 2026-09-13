import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/features/auth/api";
import { listVehicleMakes, listVehicleModels } from "@/lib/vehicles/catalog";

const querySchema = z.object({
  kind: z.enum(["makes", "models"]),
  make: z.string().trim().min(1).max(100).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  q: z.string().trim().max(100).default(""),
}).refine((value) => value.kind !== "models" || !!value.make, {
  message: "Choose a make before choosing a model.",
});

export async function GET(request: NextRequest) {
  const auth = await requireApiRole(["consumer", "technician", "org_manager", "admin"]);
  if ("response" in auth) return auth.response;

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid vehicle search." }, { status: 400 });
  }

  try {
    const values = parsed.data.kind === "makes"
      ? await listVehicleMakes()
      : await listVehicleModels(parsed.data.make!, parsed.data.year);
    const query = parsed.data.q.toLocaleLowerCase();
    const filtered = query
      ? values.filter((value) => value.toLocaleLowerCase().includes(query))
      : values;
    return NextResponse.json({ data: filtered.slice(0, 250) }, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return NextResponse.json({ error: "Vehicle suggestions are temporarily unavailable. You can still type the details." }, { status: 502 });
  }
}
