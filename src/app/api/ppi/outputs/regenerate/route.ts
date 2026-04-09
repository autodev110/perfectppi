import { NextResponse } from "next/server";
import { requireApiRole } from "@/features/auth/api";
import { regenerateOutputs } from "@/features/outputs/actions";
import { z } from "zod";

const bodySchema = z.object({
  submissionId: z.string().uuid(),
});

export async function POST(request: Request) {
  const auth = await requireApiRole(["consumer", "technician", "admin"]);
  if ("response" in auth) return auth.response;

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const result = await regenerateOutputs(parsed.data.submissionId);
  if ("error" in result) {
    const message = result.error ?? "Failed to regenerate outputs";
    const status =
      message === "Not authenticated"
        ? 401
        : message.toLowerCase().includes("not authorized")
          ? 403
          : 400;

    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ data: result.data });
}
