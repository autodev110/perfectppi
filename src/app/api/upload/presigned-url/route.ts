import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePresignedUrl, buildStorageKey } from "@/lib/storage/r2";
import { z } from "zod";
import { UPLOAD_LIMITS } from "@/config/constants";

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
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

  const body = await request.json();
  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  // Validate content type
  const allowedTypes = [
    ...UPLOAD_LIMITS.allowedImageTypes,
    ...UPLOAD_LIMITS.allowedVideoTypes,
    ...(parsed.data.entity === "media_package" ? UPLOAD_LIMITS.allowedFileTypes : []),
  ];
  if (!(allowedTypes as string[]).includes(parsed.data.contentType)) {
    return NextResponse.json(
      { error: "File type not allowed" },
      { status: 400 }
    );
  }

  const key = buildStorageKey({
    entity: parsed.data.entity,
    ownerId: profile.id,
    recordId: parsed.data.recordId,
    filename: parsed.data.filename,
  });

  try {
    const result = await generatePresignedUrl({
      key,
      contentType: parsed.data.contentType,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}
