import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadObject, buildStorageKey } from "@/lib/storage/r2";
import { z } from "zod";
import { UPLOAD_LIMITS } from "@/config/constants";

const uploadSchema = z.object({
  entity: z.string().min(1),
  recordId: z.string().uuid(),
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

  const formData = await request.formData();
  const file = formData.get("file");
  const entity = formData.get("entity");
  const recordId = formData.get("recordId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const parsed = uploadSchema.safeParse({
    entity: typeof entity === "string" ? entity : "",
    recordId: typeof recordId === "string" ? recordId : "",
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const allowedImageTypes = [...UPLOAD_LIMITS.allowedImageTypes] as string[];
  const allowedVideoTypes = [...UPLOAD_LIMITS.allowedVideoTypes] as string[];
  const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes];

  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }

  const isImage = allowedImageTypes.includes(file.type);
  const maxBytes = isImage ? UPLOAD_LIMITS.maxImageSize : UPLOAD_LIMITS.maxVideoSize;

  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File too large. Max size is ${Math.floor(maxBytes / (1024 * 1024))}MB` },
      { status: 400 }
    );
  }

  const key = buildStorageKey({
    entity: parsed.data.entity,
    ownerId: profile.id,
    recordId: parsed.data.recordId,
    filename: file.name,
  });

  try {
    const arrayBuffer = await file.arrayBuffer();
    const { publicUrl } = await uploadObject({
      key,
      body: Buffer.from(arrayBuffer),
      contentType: file.type,
    });

    return NextResponse.json({ publicUrl }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
