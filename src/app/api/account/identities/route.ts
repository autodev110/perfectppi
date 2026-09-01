import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const disconnectSchema = z.object({ provider: z.literal("google") });

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) return NextResponse.json({ error: "Could not load sign-in methods" }, { status: 500 });

  return NextResponse.json({
    data: (data?.identities ?? []).map((identity) => ({
      id: identity.id,
      provider: identity.provider,
      createdAt: identity.created_at,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const parsed = disconnectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Only Google can be disconnected here" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) return NextResponse.json({ error: "Could not load sign-in methods" }, { status: 500 });
  const identities = data?.identities ?? [];
  const google = identities.find((identity) => identity.provider === parsed.data.provider);
  if (!google) return NextResponse.json({ error: "Google is not connected" }, { status: 404 });
  if (identities.length < 2) {
    return NextResponse.json({
      error: "Add another sign-in method before disconnecting Google so you are not locked out.",
    }, { status: 409 });
  }

  const { error: unlinkError } = await supabase.auth.unlinkIdentity(google);
  if (unlinkError) return NextResponse.json({ error: unlinkError.message }, { status: 400 });
  return NextResponse.json({ disconnected: true });
}

