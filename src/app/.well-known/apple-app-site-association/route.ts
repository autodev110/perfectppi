import { NextResponse } from "next/server";

/**
 * Serves Apple App Site Association for Universal Links.
 *
 * Apple requires:
 *   - HTTPS
 *   - Content-Type: application/json (NOT application/pkcs7-mime, NOT octet-stream)
 *   - Exact path: /.well-known/apple-app-site-association  (no extension)
 *
 * Update `APP_ID_PREFIX` to your Apple Team ID + bundle ID once provisioning
 * is in place. The bundle ID below assumes `com.perfectppi.app` (configurable
 * via env so you can ship different IDs for dev / TestFlight / prod).
 */

const APP_ID_PREFIX =
  process.env.APPLE_APP_ID ?? "TEAMID.com.perfectppi.app";

export function GET() {
  const body = {
    applinks: {
      details: [
        {
          appIDs: [APP_ID_PREFIX],
          components: [
            { "/": "/callback", comment: "Supabase OAuth + password reset" },
            { "/": "/dashboard/*", comment: "Consumer deep links" },
            { "/": "/tech/*", comment: "Technician deep links" },
            { "/": "/org/*", comment: "Organization deep links" },
            { "/": "/admin/*", comment: "Admin deep links" },
          ],
        },
      ],
    },
    webcredentials: {
      apps: [APP_ID_PREFIX],
    },
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
