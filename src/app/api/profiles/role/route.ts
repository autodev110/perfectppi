import { NextResponse } from "next/server";
import { z } from "zod";
import { performRoleSwitch } from "@/features/developer/switch-role";
import { SWITCHABLE_ROLES } from "@/types/enums";

const switchRoleSchema = z.object({
  role: z.enum(SWITCHABLE_ROLES),
});

/**
 * Developer role switching for the iOS app.
 *
 * Deliberately not behind requireApiRole: that guard takes a fixed list of
 * roles, and the whole point of this endpoint is that the caller may currently
 * be any of them — including 'developer', which no portal accepts.
 * Authorization is the developer grant, which performRoleSwitch checks and
 * dev_switch_role re-checks in the database.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = switchRoleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );
  }

  const result = await performRoleSwitch(parsed.data.role);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Returns the updated profile so the client can refresh its session state
  // without a second round trip.
  return NextResponse.json(result.profile);
}
