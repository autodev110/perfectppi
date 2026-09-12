import { NextResponse } from "next/server";
import { z } from "zod";
import { getDirectory } from "@/features/technicians/queries";

const filterSchema = z.object({
  certification: z.enum(["none", "ase", "master", "oem_qualified"]).optional(),
  specialty: z.string().trim().min(1).max(80).optional(),
  orgId: z.string().uuid().optional(),
  independent: z.enum(["true", "false"]).optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = filterSchema.safeParse({
    certification: searchParams.get("certification") ?? undefined,
    specialty: searchParams.get("specialty") ?? undefined,
    orgId: searchParams.get("org_id") ?? undefined,
    independent: searchParams.get("independent") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid technician filters." }, { status: 400 });
  }

  const data = await getDirectory({
    certification: parsed.data.certification,
    specialty: parsed.data.specialty,
    orgId: parsed.data.orgId,
    isIndependent: parsed.data.independent === undefined
      ? undefined
      : parsed.data.independent === "true",
  });

  return NextResponse.json({ data });
}
