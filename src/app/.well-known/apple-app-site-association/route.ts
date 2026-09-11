import { NextResponse } from "next/server";

const appIdentifier =
  process.env.APPLE_APP_ID ?? "79P499H2M4.com.perfectppi.app";

const association = {
  applinks: {
    details: [
      {
        appIDs: [appIdentifier],
        components: [
          {
            "/": "/callback",
            comment: "Complete authentication in PerfectPPI.",
          },
          {
            "/": "/dashboard/ppi/*",
            comment: "Open consumer inspection links in PerfectPPI.",
          },
          {
            "/": "/tech/ppi/*",
            comment: "Open technician inspection links in PerfectPPI.",
          },
          {
            "/": "/dashboard/warranty/*",
            comment: "Open warranty order links in PerfectPPI.",
          },
          {
            "/": "/notifications/*",
            comment: "Open a notification's permission-checked destination in PerfectPPI.",
          },
          {
            "/": "/community/posts/*",
            comment: "Open a shared Community post in PerfectPPI (re-checked for the signed-in member).",
          },
          {
            "/": "/community/groups/*",
            comment: "Open a shared group in PerfectPPI.",
          },
          {
            "/": "/profile/*",
            comment: "Open a shared member profile in PerfectPPI.",
          },
        ],
      },
    ],
  },
  webcredentials: {
    apps: [appIdentifier],
  },
};

export function GET() {
  return NextResponse.json(association, {
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}
