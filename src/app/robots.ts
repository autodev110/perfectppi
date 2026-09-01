import type { MetadataRoute } from "next";
import { CANONICAL_ORIGIN } from "@/lib/legal/constants";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/dashboard/", "/dev/", "/org/", "/tech/", "/api/"],
    },
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
    host: CANONICAL_ORIGIN,
  };
}
