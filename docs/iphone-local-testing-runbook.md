# PerfectPPI iPhone Local Testing Runbook

The repository contains the Swift source and an XcodeGen project spec, but it does not commit the generated Xcode project. A fresh clone has:

- `mobile-app/project.yml`
- Swift source under `mobile-app/PerfectPPI`
- no tracked `mobile-app/PerfectPPI.xcodeproj`

That means Xcode cannot open and run the app until the local `.xcodeproj` is generated with XcodeGen.

The app also needs local runtime configuration. The iOS app reads `PerfectPPI/Resources/AppConfig.plist`, and `mobile-app/configure.sh` fills that plist from `mobile-app/.env`. In this updated repo, `AppConfig.plist` is intentionally ignored, so create it from `AppConfig.example.plist` before running the configure script.

There was also a signing issue in the earlier standalone repo. That original project spec declared production-style capabilities:

- Push Notifications
- Associated Domains
- `aps-environment` entitlement
- `applinks:perfectppi.com`
- `webcredentials:perfectppi.com`

A Personal Apple Developer Team cannot provision those capabilities. Xcode failed with a message like:

```text
Personal development teams do not support the Associated Domains and Push Notifications capabilities.
```

Changing only the bundle ID to `com.perfectppi.local` was not enough in the old generated project, because it still asked Apple to sign the app with those unsupported entitlements.

For TestFlight, the tracked `mobile-app/project.yml` intentionally uses the paid Apple Developer team, the production bundle ID, Push Notifications, and Associated Domains. For local Bluetooth testing with a free Personal Team, those capabilities are not required and must be removed from the generated `.xcodeproj`. The local build must also use a unique bundle identifier and that Personal Team's ID.

One env name also needed attention: the app/server code expects `R2_PUBLIC_URL`, while one copied env list used `R2_PUBLIC_UR`. Use `R2_PUBLIC_URL`.

## What Was Changed Locally

The tracked project spec is the production/TestFlight source of truth:

- bundle identifier: `com.perfectppi.app`
- Apple Developer team: `79P499H2M4`
- Push Notifications and Associated Domains enabled
- both `perfectppi.com` and canonical `www.perfectppi.com` associated domains
- app icon: `PerfectPPI-AppIcon.png`
- marketing version and build number controlled by Xcode build settings

Do not edit those tracked production values just to run a Personal Team build. Generate the project first, then patch only the ignored `.xcodeproj` as described below.

These local ignored files/folders were created:

- `.env.local`
- `mobile-app/.env`
- `mobile-app/PerfectPPI.xcodeproj/`
- `mobile-app/PerfectPPI/Resources/AppConfig.plist`

For Personal Team testing only, patch the generated local Xcode project:

- `PRODUCT_BUNDLE_IDENTIFIER` changed from `com.perfectppi.app` to `com.perfectppi.local`
- `DEVELOPMENT_TEAM` changed to the local Personal Team ID
- If a generated project contains `CODE_SIGN_ENTITLEMENTS = PerfectPPI/Resources/PerfectPPI.entitlements;`, remove it

Removing the entitlements reference is what avoids the unsupported Push Notifications and Associated Domains signing requirement for local Personal Team testing. A freshly generated production project includes that reference, so remove it only from the ignored generated project.

Because `mobile-app/PerfectPPI.xcodeproj/` is ignored and generated, these patches are local only. If you run `xcodegen generate` again, reapply the local bundle ID/team patch.

## Recreate From A Fresh Clone

Run commands from the repo root:

```bash
cd "/Users/dan/Desktop/perfect ppi/ppi-standalone"
```

Create local env files. Do not commit these.

```bash
cp mobile-app/.env.example mobile-app/.env
```

Fill `mobile-app/.env` with the real values. The iPhone app needs at least:

```bash
NEXT_PUBLIC_SUPABASE_URL="..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
NEXT_PUBLIC_SITE_URL="https://perfectppi.vercel.app"
```

If you also run the web/API app locally, create `.env.local` at the repo root with the server-side values too. Make sure the R2 public URL key is named:

```bash
R2_PUBLIC_URL="..."
```

Then write the mobile plist config:

```bash
cd mobile-app
cp PerfectPPI/Resources/AppConfig.example.plist PerfectPPI/Resources/AppConfig.plist
./configure.sh
```

Install XcodeGen if needed:

```bash
brew install xcodegen
```

Generate the Xcode project:

```bash
xcodegen generate
```

If `xcodebuild` complains that the active developer directory is CommandLineTools, use the full Xcode developer directory for commands:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -version
```

If Xcode says an iOS platform/runtime is missing, install it from Xcode Settings > Components, or from the CLI:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -downloadPlatform iOS
```

Resolve Swift packages:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -resolvePackageDependencies \
  -project PerfectPPI.xcodeproj \
  -scheme PerfectPPI
```

For a free Personal Team build only, apply the local signing patch. Replace `<PERSONAL_TEAM_ID>` with the Team ID shown for your Personal Team in Xcode:

```bash
PERSONAL_TEAM_ID="<PERSONAL_TEAM_ID>"
perl -0pi -e 's/\n\t+\t+CODE_SIGN_ENTITLEMENTS = PerfectPPI\/Resources\/PerfectPPI\.entitlements;//g; s/PRODUCT_BUNDLE_IDENTIFIER = com\.perfectppi\.app;/PRODUCT_BUNDLE_IDENTIFIER = com.perfectppi.local;/g; s/DEVELOPMENT_TEAM = [A-Z0-9]+;/DEVELOPMENT_TEAM = '"$PERSONAL_TEAM_ID"';/g' PerfectPPI.xcodeproj/project.pbxproj
```

Verify the app target no longer references an entitlements file and uses the local bundle ID:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project PerfectPPI.xcodeproj \
  -scheme PerfectPPI \
  -showBuildSettings | rg "CODE_SIGN_ENTITLEMENTS|PRODUCT_BUNDLE_IDENTIFIER|DEVELOPMENT_TEAM|CODE_SIGN_STYLE"
```

Expected important result:

```text
PRODUCT_BUNDLE_IDENTIFIER = com.perfectppi.local
DEVELOPMENT_TEAM = <PERSONAL_TEAM_ID>
CODE_SIGN_STYLE = Automatic
```

There should be no `CODE_SIGN_ENTITLEMENTS` line for the app target.

## Build Sanity Check

Before using the phone, a simulator compile check can catch normal Swift build errors:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project PerfectPPI.xcodeproj \
  -scheme PerfectPPI \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Expected result:

```text
** BUILD SUCCEEDED **
```

## Physical iPhone Build Check

After the phone is visible to Xcode, find the device ID:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project PerfectPPI.xcodeproj \
  -scheme PerfectPPI \
  -showdestinations
```

Then build for the device:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project PerfectPPI.xcodeproj \
  -scheme PerfectPPI \
  -destination 'id=YOUR_DEVICE_ID' \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  build
```

If the error says Developer Mode is disabled, enable Developer Mode on the iPhone and retry.

If Xcode still shows the old Push Notifications or Associated Domains signing error, quit and reopen Xcode after applying the local signing patch.

## TestFlight Release Build

Do not apply the Personal Team patch for TestFlight. The production project must use:

```text
PRODUCT_BUNDLE_IDENTIFIER = com.perfectppi.app
DEVELOPMENT_TEAM = 79P499H2M4
CODE_SIGN_ENTITLEMENTS = PerfectPPI/Resources/PerfectPPI.entitlements
```

Before each upload, increment `CURRENT_PROJECT_VERSION` in `mobile-app/project.yml`, regenerate the project, and verify the embedded runtime configuration. Never put server-only secrets in `mobile-app/.env`; the app bundle should contain only the public Supabase URL, publishable/anonymous key, and public API URL.

Create the archive with the full Xcode developer toolchain:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project PerfectPPI.xcodeproj \
  -scheme PerfectPPI \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath /tmp/PerfectPPI.xcarchive \
  clean archive \
  -allowProvisioningUpdates
```

Open the archive in Xcode Organizer, choose **Distribute App**, select **App Store Connect**, and upload it. Xcode must report both `Upload succeeded` and `EXPORT SUCCEEDED`. App Store Connect then processes the build before it becomes selectable in a TestFlight tester group.

Before release, verify that the canonical domain serves the association file directly, without authentication or another redirect:

```bash
curl -i https://www.perfectppi.com/.well-known/apple-app-site-association
```

The response must be `200`, use `Content-Type: application/json`, and contain `79P499H2M4.com.perfectppi.app`.

## Install And Trust On The iPhone

Xcode's Run button usually builds, installs, and launches the app. You can also install a built app from the command line:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcrun devicectl device install app \
  --device YOUR_DEVICE_ID \
  build/DeviceDerivedData/Build/Products/Debug-iphoneos/PerfectPPI.app
```

If the app installs but will not open, and the error says the profile is not explicitly trusted, fix it on the iPhone:

```text
Settings > General > VPN & Device Management
```

Open the developer profile for the Apple ID/team used by Xcode, tap Trust, then launch PerfectPPI again.

## Important Notes

Once Xcode installs the app on the iPhone, the phone does not need to stay plugged into the Mac. Keep it plugged in only for live logs, debugging, breakpoints, or installing a new build.

With a Personal Team/free signing setup, the installed app may expire after a few days. If it stops opening, reconnect the phone and run/install from Xcode again.

The local signing patch is only for physical-device testing with a Personal Team. It should not be treated as the production App Store/TestFlight configuration, because production builds probably do need push notifications, associated domains, universal links, and the real bundle ID.
