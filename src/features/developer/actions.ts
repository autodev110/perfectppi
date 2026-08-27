"use server";

import { revalidatePath } from "next/cache";
import { performRoleSwitch } from "@/features/developer/switch-role";
import type { UserRole } from "@/types/enums";

/**
 * Switch the calling account's role. Only accounts holding the developer grant
 * may do this; everyone else keeps the narrow, one-way upgrade paths in
 * features/profiles/actions.
 *
 * The work itself lives in switch-role.ts so the mobile route
 * (/api/profiles/role) runs exactly the same provisioning and checks.
 */
export async function switchRole(role: UserRole) {
  const result = await performRoleSwitch(role);

  if ("error" in result) {
    return { error: result.error };
  }

  // A switch changes what every portal renders, so the whole tree is stale —
  // not just the settings page the click came from.
  revalidatePath("/", "layout");

  return { success: true, redirectTo: result.redirectTo };
}
