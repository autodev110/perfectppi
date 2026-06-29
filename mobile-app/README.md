# PerfectPPI iOS App

Native iPhone + iPad client for the PerfectPPI web platform. Talks to the same
Next.js API as the web (`src/app/api/*`), so most product logic lives
server-side and this app focuses on UX and platform integration (camera, push,
PDF, Face ID, deep links).

- **Stack:** Swift 5.10, SwiftUI, async/await, Swift Concurrency strict mode
- **Min iOS:** 17.0
- **Auth:** Supabase Swift SDK → bearer-token to the existing Next.js API
- **Storage:** Cloudflare R2 via existing `/api/upload/presigned-url`
- **Payments:** Stripe Checkout in `SFSafariViewController`
- **E-sign:** DocuSeal in `SFSafariViewController`
- **Push:** APNs token via `/api/notifications/devices`

## Bootstrap

The repo ships the Swift source and an [XcodeGen](https://github.com/yonaskolb/XcodeGen)
spec (`project.yml`) but **not** the generated `.xcodeproj`. Generate the
project locally with:

```bash
brew install xcodegen          # one time
cd mobile-app
xcodegen generate
open PerfectPPI.xcodeproj
```

Then in Xcode:

1. Select the **PerfectPPI** target → **Signing & Capabilities**.
2. Choose your Apple Developer team. The bundle ID is `com.perfectppi.app`
   — change in `project.yml` and re-run XcodeGen if needed.
3. Enable capabilities (already declared in `project.yml`, but Xcode needs to
   provision them against your team):
   - **Push Notifications**
   - **Associated Domains** (`applinks:perfectppi.com`, `webcredentials:perfectppi.com`)
   - **Background Modes** → **Remote notifications**
4. Update `applinks:` and `webcredentials:` in `project.yml` to match the
   domain that hosts the Next.js API (the one that serves
   `/.well-known/apple-app-site-association`).
5. Set the runtime config in `Resources/AppConfig.plist` (created on first
   build from `AppConfig.example.plist`):
   - `APIBaseURL` — e.g. `https://perfectppi.com`
   - `SupabaseURL`, `SupabaseAnonKey`

## Server-side requirements

The iOS app depends on these server features (already added in this repo):

- `Authorization: Bearer <jwt>` accepted by every `/api/*` route via
  `src/lib/supabase/server.ts:createApiClient` (used by
  `src/features/auth/api.ts:requireApiRole`).
- Device-token endpoint: `POST /api/notifications/devices`.
- Notification inbox: `GET /api/notifications`, `PATCH /api/notifications/[id]`.
- APNs dispatch: `src/lib/push/dispatch.ts` triggered from existing server
  actions and webhook handlers.
- Universal Links AASA: `src/app/.well-known/apple-app-site-association/route.ts`.
- Full-platform mobile parity endpoints for marketplace, community, reviews,
  conversations, media packages, and admin extended records:
  `/api/marketplace/*`, `/api/community/*`, `/api/technicians/*/reviews`,
  `/api/ppi/requests/*/review`, `/api/messages/recipients`,
  `/api/admin/listings`, `/api/admin/community`, `/api/admin/reviews`.

## Environment variables (server)

Add these to Vercel (or your host) for push to work:

```
APNS_AUTH_KEY        # multiline PEM private key from Apple Developer
APNS_KEY_ID          # 10-char Key ID
APNS_TEAM_ID         # 10-char Team ID
APNS_TOPIC           # com.perfectppi.app
APPLE_APP_ID         # TEAMID.com.perfectppi.app  (used by AASA route)
```

## Folder layout

```
PerfectPPI/
├── App/                       app lifecycle, root view, scene + AppDelegate
├── Core/
│   ├── Networking/            APIClient, endpoints, error model
│   ├── Auth/                  Supabase wiring, Keychain, BiometricGate
│   ├── Storage/               R2 presigned upload, offline queue
│   ├── Push/                  APNs registration + tap routing
│   ├── DeepLinks/             URLRouter for perfectppi:// + universal links
│   └── Models/                Codable DTOs (mirror the server)
├── Features/
│   ├── Auth/                  login, signup, oauth callback
│   ├── Consumer/              dashboard, vehicles, ppi wizard, warranty
│   ├── Marketplace/           browse/create listings, contact sellers
│   ├── Community/             feed, posts, comments
│   ├── Messages/              conversations and direct messages
│   ├── Media/                 media packages and share links
│   ├── Technician/
│   │   ├── Queue/             list of assigned PPIs
│   │   ├── Inspection/        guided workflow, per-question photos
│   │   └── Camera/            AVFoundation capture
│   ├── Organization/          org dashboard, techs, inspections
│   ├── Admin/                 admin dashboards
│   ├── Profile/               shared profile + settings
│   ├── Warranty/              plan selection + SFSafariView checkout
│   ├── DocuSign/              SFSafariView wrapper for DocuSeal
│   └── PDF/                   PDFKit viewer
├── DesignSystem/              colors, typography, shared SwiftUI components
└── Resources/                 Info.plist, entitlements, AppConfig.plist, Assets.xcassets
```

## Building from CI

```
xcodegen generate
xcodebuild \
  -project PerfectPPI.xcodeproj \
  -scheme PerfectPPI \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  -configuration Debug \
  build
```

## Push notifications setup (one-time)

1. In the Apple Developer portal, create an APNs Auth Key. Download the `.p8`
   file. Copy its contents into `APNS_AUTH_KEY` (preserve newlines).
2. Record the Key ID and Team ID into env.
3. Bundle ID for `APNS_TOPIC` must match the app's Product Bundle Identifier
   exactly (`com.perfectppi.app` by default).
4. For TestFlight / production builds, switch the entitlement
   `aps-environment` from `development` to `production` and the
   `/api/notifications/devices` payload's `env` from `sandbox` to `prod`.

## Testing

- **Camera, Face ID, push:** real device only (simulator fakes the camera and
  can't receive APNs).
- **Bearer-token auth:** sign in on the device, hit any `/api/*` endpoint with
  the JWT in `Authorization`. Use the in-app Logs/Diagnostics screen.
- **Offline inspection:** enable airplane mode mid-inspection, answer +
  capture, re-enable network, confirm draft queue drains.
- **Universal links:** open `https://<your-domain>/callback?code=...` from
  Mail; the app should open directly.

## App Store submission notes

- **Stripe via SFSafariViewController** is allowed because warranty plans are
  a real-world service (vehicle warranty). Document this in the review notes
  to avoid Guideline 3.1.1 confusion.
- Add a privacy manifest (`PrivacyInfo.xcprivacy`) declaring required reason
  APIs: file timestamp, system boot time, user defaults.
- Provide a demo account (consumer, technician) in the review notes.
