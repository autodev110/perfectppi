import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnedVehicle } from "@/features/vehicles/queries";
import { deleteVehicle } from "@/features/vehicles/actions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const vehicle = await getOwnedVehicle(id);
  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }
  return NextResponse.json(vehicle);
}

const updateSchema = z.object({
  vin: z.string().max(17).optional(),
  year: z.number().min(1900).max(2100).optional(),
  make: z.string().min(1).max(100).optional(),
  model: z.string().min(1).max(100).optional(),
  trim: z.string().max(100).optional(),
  engine: z.string().trim().max(100).nullable().optional(),
  drivetrain: z.string().trim().max(100).nullable().optional(),
  transmission: z.string().trim().max(100).nullable().optional(),
  body_style: z.string().trim().max(100).nullable().optional(),
  configuration_type: z.enum(["stock", "modified", "custom_build"]).optional(),
  engine_original: z.boolean().optional(),
  transmission_original: z.boolean().optional(),
  drivetrain_original: z.boolean().optional(),
  mileage_status: z.enum(["actual", "not_actual", "unknown"]).optional(),
  nickname: z.string().trim().max(60).nullable().optional(),
  ownership_state: z.enum(["owned", "previously_owned", "considering", "project"]).optional(),
  mileage: z.number().min(0).optional(),
  visibility: z.enum(["public", "friends", "private"]).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }
  const existing = await getOwnedVehicle(id);
  if (!existing) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }
  if (parsed.data.ownership_state === "previously_owned" && existing.ownership_state !== "previously_owned") {
    return NextResponse.json(
      { error: "Use Mark as sold so active listings and your history privacy choice are updated together." },
      { status: 400 },
    );
  }
  const effectiveConfigurationType = parsed.data.configuration_type ?? existing.configuration_type;
  const effectiveOriginalEquipment = [
    parsed.data.engine_original ?? existing.engine_original,
    parsed.data.transmission_original ?? existing.transmission_original,
    parsed.data.drivetrain_original ?? existing.drivetrain_original,
  ];
  if (effectiveConfigurationType === "stock" && effectiveOriginalEquipment.includes(false)) {
    return NextResponse.json(
      { error: "Choose Modified or Custom build when factory equipment has been replaced." },
      { status: 400 },
    );
  }

  const { notes, ...vehicleFields } = parsed.data;
  const updateData = {
    ...vehicleFields,
    vin: vehicleFields.vin === undefined
      ? undefined
      : vehicleFields.vin.trim().toUpperCase() || null,
    trim: vehicleFields.trim === undefined ? undefined : vehicleFields.trim || null,
    engine: vehicleFields.engine === undefined ? undefined : vehicleFields.engine?.trim() || null,
    drivetrain: vehicleFields.drivetrain === undefined ? undefined : vehicleFields.drivetrain?.trim() || null,
    transmission: vehicleFields.transmission === undefined ? undefined : vehicleFields.transmission?.trim() || null,
    body_style: vehicleFields.body_style === undefined ? undefined : vehicleFields.body_style?.trim() || null,
    nickname: vehicleFields.nickname === undefined ? undefined : vehicleFields.nickname || null,
  };

  const hasVehicleUpdates = Object.values(updateData).some((value) => value !== undefined);
  const { error } = hasVehicleUpdates
    ? await supabase.from("vehicles").update(updateData).eq("id", id)
    : { error: null };

  if (error?.code === "23505") {
    return NextResponse.json(
      { error: "It looks like you already have a vehicle with this same VIN.", code: "duplicate_vin" },
      { status: 409 }
    );
  }
  if (error) {
    return NextResponse.json({ error: "The vehicle could not be updated. Please try again." }, { status: 500 });
  }

  if (notes !== undefined) {
    const { error: notesError } = notes
      ? await supabase.from("vehicle_notes").upsert(
          { vehicle_id: id, notes },
          { onConflict: "vehicle_id" },
        )
      : await supabase.from("vehicle_notes").delete().eq("vehicle_id", id);
    if (notesError) {
      return NextResponse.json(
        { error: "The vehicle notes could not be updated. Please try again." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(await getOwnedVehicle(id));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await deleteVehicle(id);
  if (result?.error) {
    const status = result.error === "Not authenticated"
      ? 401
      : result.error === "Vehicle not found" ? 404 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ success: true });
}
