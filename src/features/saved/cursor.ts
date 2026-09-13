import { z } from "zod";

const savedCursorSchema = z.object({
  v: z.literal(1),
  kind: z.enum(["posts", "listings"]),
  savedAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

export type SavedCursorKind = z.infer<typeof savedCursorSchema>["kind"];
export type SavedCursor = z.infer<typeof savedCursorSchema>;

export function encodeSavedCursor(cursor: SavedCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSavedCursor(
  value: string | null | undefined,
  expectedKind: SavedCursorKind,
): SavedCursor | null {
  if (!value || value.length > 256) return null;

  try {
    const parsed = savedCursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (!parsed.success || parsed.data.kind !== expectedKind) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
