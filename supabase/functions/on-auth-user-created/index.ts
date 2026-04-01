// Edge Function: on-auth-user-created
// Backup for the DB trigger — creates a profiles row when a new user signs up.
// The DB trigger in 001_profiles.sql handles this automatically,
// but this edge function serves as a fallback for edge cases.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const payload = await req.json();
  const { record } = payload;

  if (!record?.id) {
    return new Response(JSON.stringify({ error: "No user record" }), {
      status: 400,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Check if profile already exists (DB trigger may have created it)
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", record.id)
    .single();

  if (existing) {
    return new Response(JSON.stringify({ message: "Profile already exists" }), {
      status: 200,
    });
  }

  const { error } = await supabase.from("profiles").insert({
    auth_user_id: record.id,
    display_name:
      record.raw_user_meta_data?.full_name ||
      record.raw_user_meta_data?.name ||
      "",
    avatar_url:
      record.raw_user_meta_data?.avatar_url ||
      record.raw_user_meta_data?.picture ||
      "",
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ message: "Profile created" }), {
    status: 201,
  });
});
