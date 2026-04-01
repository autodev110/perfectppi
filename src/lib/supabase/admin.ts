import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Service-role client — bypasses RLS.
// ONLY use in privileged server-side operations (admin routes, edge functions).
// NEVER import in client components.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
