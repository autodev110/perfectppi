import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOwnedVehicle } from "@/features/vehicles/queries";

const soldSchema = z.object({
  keep_public_history: z.boolean(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = soldSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose how this vehicle history should be shared." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { error } = await supabase.rpc("mark_vehicle_previously_owned", {
    p_vehicle_id: parsedId.data,
    p_keep_public_history: parsed.data.keep_public_history,
  });
  if (error) {
    const status = error.code === "42501" ? 404 : 500;
    return NextResponse.json(
      { error: status === 404 ? "Vehicle not found" : "This vehicle could not be marked as sold. Please try again." },
      { status },
    );
  }

  return NextResponse.json(await getOwnedVehicle(parsedId.data));
}
