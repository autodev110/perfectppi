import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getMyVehicles } from "@/features/vehicles/queries";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json(await getMyVehicles());
}

const createSchema = z.object({
  vin: z.string().max(17).optional(),
  year: z.number().min(1900).max(2100).optional(),
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  trim: z.string().max(100).optional(),
  nickname: z.string().trim().max(60).optional(),
  ownership_state: z.enum(["owned", "previously_owned", "considering", "project"]).optional(),
  mileage: z.number().min(0).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  notes: z.string().trim().max(5000).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const normalizedVin = parsed.data.vin?.trim().toUpperCase() || null;
  if (normalizedVin) {
    const { data: existingVehicle } = await supabase
      .from("vehicles")
      .select("*, vehicle_media(*)")
      .eq("owner_id", profile.id)
      .not("vin", "is", null)
      .then(({ data }) => ({
        data: data?.find((vehicle) => vehicle.vin?.trim().toUpperCase() === normalizedVin) ?? null,
      }));
    if (existingVehicle) {
      return NextResponse.json({
        error: "It looks like you already have a vehicle with this same VIN.",
        code: "duplicate_vin",
        existing_vehicle: existingVehicle,
      }, { status: 409 });
    }
  }

  const { notes, ...vehicleFields } = parsed.data;
  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      ...vehicleFields,
      vin: normalizedVin,
      trim: parsed.data.trim || null,
      nickname: parsed.data.nickname || null,
      owner_id: profile.id,
    })
    .select()
    .single();

  if (error?.code === "23505" && normalizedVin) {
    const { data: existingVehicle } = await supabase
      .from("vehicles")
      .select("*, vehicle_media(*)")
      .eq("owner_id", profile.id)
      .not("vin", "is", null)
      .then(({ data }) => ({
        data: data?.find((vehicle) => vehicle.vin?.trim().toUpperCase() === normalizedVin) ?? null,
      }));
    return NextResponse.json({
      error: "It looks like you already have a vehicle with this same VIN.",
      code: "duplicate_vin",
      existing_vehicle: existingVehicle,
    }, { status: 409 });
  }
  if (error) {
    return NextResponse.json(
      { error: "The vehicle could not be saved. Please try again." },
      { status: 500 }
    );
  }

  if (notes) {
    const { error: notesError } = await supabase
      .from("vehicle_notes")
      .insert({ vehicle_id: data.id, notes });
    if (notesError) {
      await supabase.from("vehicles").delete().eq("id", data.id);
      return NextResponse.json(
        { error: "The vehicle could not be saved. Please try again." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ...data, notes: notes || null }, { status: 201 });
}
