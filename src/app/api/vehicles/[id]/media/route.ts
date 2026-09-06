import { NextResponse } from "next/server";
import { z } from "zod";
import { vehicleUploadReferenceSchema } from "@/features/uploads/url";
import { attachVehiclePhoto } from "@/features/vehicles/actions";

const mediaSchema = z.object({
  url: vehicleUploadReferenceSchema,
  media_type: z.enum(["image", "video"]).default("image"),
  is_primary: z.boolean().default(false),
  sort_order: z.number().default(0),
  content_type: z.string().regex(/^(image|video)\//),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = mediaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const result = await attachVehiclePhoto({
    vehicleId: id,
    url: parsed.data.url,
    mediaType: parsed.data.media_type,
    contentType: parsed.data.content_type,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.data, { status: 201 });
}
