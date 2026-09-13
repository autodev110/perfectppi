import { z } from "zod";

export const CURSOR_SEARCH_TABS = ["posts", "people", "groups", "vehicles", "listings", "technicians", "events"] as const;
export type CursorSearchTab = (typeof CURSOR_SEARCH_TABS)[number];

const common = {
  v: z.literal(1),
  q: z.string().min(2).max(100),
  rank: z.number().int().nonnegative(),
  id: z.string().uuid(),
};

const searchCursorSchema = z.discriminatedUnion("tab", [
  z.object({ ...common, tab: z.enum(["posts", "vehicles", "listings"]), sortAt: z.string().datetime({ offset: true }) }),
  z.object({ ...common, tab: z.literal("groups"), sortText: z.string().min(1).max(200) }),
  z.object({ ...common, tab: z.literal("technicians"), sortCount: z.number().int().nonnegative() }),
  z.object({ ...common, tab: z.literal("people"), sortExact: z.boolean(), sortPrefix: z.boolean(), sortText: z.string().max(200) }),
  z.object({ ...common, tab: z.literal("events"), sortRank: z.number().int().min(0).max(1), sortAt: z.string().datetime({ offset: true }) }),
]);

export type SearchCursor = z.infer<typeof searchCursorSchema>;

export function usesSearchCursor(tab: string): tab is CursorSearchTab {
  return (CURSOR_SEARCH_TABS as readonly string[]).includes(tab);
}

export function encodeSearchCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSearchCursor(
  value: string | null | undefined,
  expectedTab: CursorSearchTab,
  expectedQuery: string,
): SearchCursor | null {
  if (!value || value.length > 512) return null;

  try {
    const parsed = searchCursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (!parsed.success || parsed.data.tab !== expectedTab || parsed.data.q !== expectedQuery) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
