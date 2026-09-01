import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN, LEGAL_LAST_UPDATED } from "@/lib/legal/constants";

const publicPaths = [
  "",
  "/marketplace",
  "/community",
  "/technicians",
  "/privacy",
  "/terms",
  "/privacy-choices",
  "/notice-at-collection",
  "/community-guidelines",
  "/ai-disclosure",
  "/accessibility",
  "/copyright",
  "/warranty-disclosure",
  "/support",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({
    url: `${CANONICAL_ORIGIN}${path || "/"}`,
    lastModified: new Date(LEGAL_LAST_UPDATED),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
