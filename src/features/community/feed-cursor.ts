import { z } from "zod";

const cursorPayloadSchema = z.tuple([
  z.string().datetime({ offset: true }),
  z.string().uuid(),
]);

export type CommunityFeedCursor = {
  createdAt: string;
  postId: string;
};

export function encodeCommunityFeedCursor(cursor: CommunityFeedCursor) {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.postId]), "utf8").toString("base64url");
}

export function decodeCommunityFeedCursor(value: string | null | undefined): CommunityFeedCursor | null {
  if (!value || value.length > 256) return null;

  try {
    const parsed = cursorPayloadSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (!parsed.success) return null;
    return { createdAt: parsed.data[0], postId: parsed.data[1] };
  } catch {
    return null;
  }
}
