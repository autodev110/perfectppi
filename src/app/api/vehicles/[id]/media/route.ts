import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const mediaSchema = z.object({
  url: z.string().url(),
  media_type: z.enum(["image", "video"]).default("image"),
  is_primary: z.boolean().default(false),
  sort_order: z.number().default(0),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const body = await request.json();
  const parsed = mediaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("vehicle_media")
    .insert({ ...parsed.data, vehicle_id: id })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
