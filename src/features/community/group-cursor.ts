import { z } from "zod";

const common = {
  v: z.literal(1),
  groupId: z.string().uuid(),
  id: z.string().uuid(),
};

const groupDirectoryCursorSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("posts"), sortAt: z.string().datetime({ offset: true }) }),
  z.object({ ...common, kind: z.literal("search"), q: z.string().min(2).max(100), sortAt: z.string().datetime({ offset: true }) }),
  z.object({ ...common, kind: z.literal("members"), roleRank: z.number().int().min(0).max(3), sortAt: z.string().datetime({ offset: true }) }),
  z.object({ ...common, kind: z.literal("faq"), q: z.string().max(100), sortAt: z.string().datetime({ offset: true }) }),
]);

export type GroupDirectoryCursor = z.infer<typeof groupDirectoryCursorSchema>;
export type GroupDirectoryCursorKind = GroupDirectoryCursor["kind"];
export type GroupDirectoryCursorFor<T extends GroupDirectoryCursorKind> = GroupDirectoryCursor extends infer Cursor
  ? Cursor extends { kind: infer Kind }
    ? T extends Kind
      ? Cursor
      : never
    : never
  : never;

export function normalizeGroupDirectoryQuery(value: string | null | undefined) {
  return (value ?? "").trim().slice(0, 100).toLowerCase();
}

export function encodeGroupDirectoryCursor(cursor: GroupDirectoryCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeGroupDirectoryCursor<T extends GroupDirectoryCursorKind>(
  value: string | null | undefined,
  expectedKind: T,
  expectedGroupId: string,
  expectedQuery = "",
): GroupDirectoryCursorFor<T> | null {
  if (!value || value.length > 512) return null;

  try {
    const parsed = groupDirectoryCursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (!parsed.success || parsed.data.kind !== expectedKind || parsed.data.groupId !== expectedGroupId) return null;
    if ("q" in parsed.data && parsed.data.q !== normalizeGroupDirectoryQuery(expectedQuery)) return null;
    return parsed.data as GroupDirectoryCursorFor<T>;
  } catch {
    return null;
  }
}
