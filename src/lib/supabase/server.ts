import { createServerClient } from "@supabase/ssr";
import { createClient as createBaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const headerList = await headers();
  const authHeader = headerList.get("authorization") ?? headerList.get("Authorization");
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);

  if (bearerMatch) {
    const token = bearerMatch[1].trim();
    return createBaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}

export async function createApiClient() {
  return createClient();
}
