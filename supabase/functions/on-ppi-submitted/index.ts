// Edge function: fires when ppi_submissions.status transitions to 'submitted'
// Triggers Stage 1 (standardized output) then Stage 2 (VSC output)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;

    if (!record || record.status !== "submitted") {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // TODO Phase C: Call standardized output generator (Stage 1)
    // TODO Phase C: Call VSC generator (Stage 2)
    console.log("on-ppi-submitted triggered for submission:", record.id);

    void supabase; // referenced above, used in Phase C implementation

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
