import type { NextConfig } from "next";
import { PARTNER_SYSTEMS, browserConnectOrigin } from "./src/features/partner/systems";

const nextConfig: NextConfig = {
  // The inspection report renderer reads its versioned layout spec and the
  // embedded fonts from disk at runtime; ship them with every server route.
  outputFileTracingIncludes: {
    "/**/*": ["./src/lib/pdf/inspection-report/layout-spec.json", "./src/lib/pdf/inspection-report/fonts/**/*"],
  },
  async headers() {
    const scriptSrc = process.env.NODE_ENV === "production"
      ? "'self' 'unsafe-inline'"
      : "'self' 'unsafe-inline' 'unsafe-eval'";
    let docusealOrigin = "https://docuseal.com";
    try {
      docusealOrigin = new URL(
        process.env.DOCUSEAL_PUBLIC_URL ?? process.env.DOCUSEAL_API_URL ?? docusealOrigin,
      ).origin;
    } catch {
      // Keep the hosted default if a deployment value is malformed.
    }
    const csp = [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      `frame-src 'self' https://docuseal.com https://*.docuseal.com ${docusealOrigin}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");
    // Consent screens end in a redirect to the partner's own application, and browsers
    // apply form-action to it when the form posts before the page has hydrated.
    const partnerOrigins = Object.values(PARTNER_SYSTEMS).map(browserConnectOrigin).filter(Boolean);
    const partnerFlowCsp = csp.replace("form-action 'self'", ["form-action 'self'", ...partnerOrigins].join(" "));
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }, ...["/connect/:path*", "/link/:path*"].map((source) => ({
      source,
      headers: [{ key: "Content-Security-Policy", value: partnerFlowCsp }],
    }))];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
