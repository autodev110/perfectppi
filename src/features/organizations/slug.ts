import { slugify } from "@/lib/utils/formatting";
import type { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Organization slugs are unique and public-facing, so a name collision has to
 * resolve to a usable suffix rather than a constraint error mid-onboarding.
 */
export async function getUniqueOrganizationSlug(
  supabase: ServerClient,
  organizationName: string
) {
  const baseSlug = slugify(organizationName) || "organization";

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    const { data } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (!data) {
      return candidate;
    }
  }

  return `${baseSlug}-${Date.now()}`;
}
