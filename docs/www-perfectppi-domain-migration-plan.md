# PerfectPPI `www.perfectppi.com` Migration Plan

Status: **Deferred**

PerfectPPI will continue using `https://perfectppi.vercel.app` as the web and
iOS API base URL until this plan is intentionally implemented and verified.
Do not partially switch production systems to `https://www.perfectppi.com`.

## Objective

Make `https://www.perfectppi.com` the single canonical public website and API
origin for the web application, iOS application, authentication callbacks,
universal links, shared web credentials, payment webhooks, document-signing
webhooks, partner integrations, and documentation.

The apex host `https://perfectppi.com` may redirect ordinary browser traffic to
`www`, but it should not remain in the iOS Associated Domains entitlement unless
it serves its own Apple App Site Association file directly without a redirect.

## Current Verified State

- `https://www.perfectppi.com` responds successfully.
- `https://www.perfectppi.com/.well-known/apple-app-site-association` responds
  with HTTP 200, `application/json`, and the expected application identifier
  `79P499H2M4.com.perfectppi.app`.
- `https://perfectppi.com/.well-known/apple-app-site-association` redirects to
  `www`. Apple does not support redirects when retrieving an AASA file.
- Canonical metadata and legal constants already use `www.perfectppi.com`.
- The active TestFlight API base URL should remain
  `https://perfectppi.vercel.app` until this migration is started.

## Repository Changes

Replace the old Vercel production origin or non-canonical apex origin where it
represents the public site/API:

1. `.github/workflows/testflight.yml`
   - Change the fallback for `IOS_API_BASE_URL` to
     `https://www.perfectppi.com`.
2. `mobile-app/.env.example`
   - Change `API_BASE_URL` to `https://www.perfectppi.com`.
3. `mobile-app/PerfectPPI/Resources/AppConfig.example.plist`
   - Change `APIBaseURL` to `https://www.perfectppi.com`.
4. `mobile-app/PerfectPPI/Features/Media/MediaPackagesView.swift`
   - Change the fallback URL to `https://www.perfectppi.com`.
5. `mobile-app/PerfectPPI/Resources/PerfectPPI.entitlements`
   - Remove `applinks:perfectppi.com`.
   - Remove `webcredentials:perfectppi.com`.
   - Keep `applinks:www.perfectppi.com`.
   - Keep `webcredentials:www.perfectppi.com`.
6. `mobile-app/project.yml`
   - Make the same Associated Domains changes so regenerated Xcode projects do
     not restore the apex entries.

Do not replace the localhost value in the root `.env.example`; it is the
intentional local-development default.

## Local Developer Configuration

Update these ignored files without committing their secrets:

- `.env.local`: set `NEXT_PUBLIC_SITE_URL=https://www.perfectppi.com`.
- `mobile-app/.env`: set `NEXT_PUBLIC_SITE_URL=https://www.perfectppi.com` or
  `API_BASE_URL=https://www.perfectppi.com`.

Regenerate the client-safe plist and Xcode project:

```bash
cd mobile-app
./configure.sh
xcodegen generate
```

Confirm the generated `AppConfig.plist` contains the new API origin before
building locally or archiving.

## External Dashboard Changes

### Vercel

1. Confirm `www.perfectppi.com` is attached to the correct PerfectPPI project.
2. Make `www.perfectppi.com` the canonical production domain.
3. Set `NEXT_PUBLIC_SITE_URL=https://www.perfectppi.com` for Production.
4. Decide separately whether Preview deployments should use production or their
   own preview origins.
5. Redeploy Production after changing environment variables.

The Vercel-provided hostname may continue to exist, but the application should
stop generating it as the canonical origin.

### GitHub TestFlight Environment

Set the `testflight` environment variable:

```text
IOS_API_BASE_URL=https://www.perfectppi.com
```

Do this only when the custom domain and production deployment have passed the
verification checklist below.

### Supabase Authentication

In **Authentication > URL Configuration**:

1. Set the Site URL to `https://www.perfectppi.com`.
2. Add the exact production redirect URL
   `https://www.perfectppi.com/callback`.
3. Keep `perfectppi://callback` for the native iOS OAuth flow.
4. Keep explicit localhost redirects needed for development.
5. Remove the old Vercel production redirect only after web and iOS sign-in have
   been verified on `www`.

### Google Authentication

1. Add `https://www.perfectppi.com` under Authorized JavaScript origins.
2. Keep the provider redirect URI pointed at the Supabase Auth callback. Do not
   replace the Supabase callback with the application callback.
3. Verify consent-screen branding and authorized-domain ownership if required.

### Stripe

Update the production webhook endpoint to:

```text
https://www.perfectppi.com/api/webhooks/stripe
```

Preserve the existing webhook signing secret unless Stripe creates a new
endpoint with a different secret. Verify Checkout success and cancellation
return to the `www` host.

### DocuSeal

Update the production webhook endpoint to:

```text
https://www.perfectppi.com/api/webhooks/docuseal
```

Preserve and verify the configured webhook signing secret.

### DealerSpace And Other Partners

Update stored PerfectPPI API base URLs, authorization URLs, allowlists, and
documentation to use `https://www.perfectppi.com`. Existing partner-owned
webhook and callback destinations are not PerfectPPI domains and should not be
rewritten.

## Documentation Changes

Update production examples in:

- `docs/iphone-local-testing-runbook.md`
- `docs/testflight-ci.md`
- `docs/DEALERSPACE_INTEGRATION.md`
- `mobile-app/README.md`

Keep historical references only when they are explicitly labeled as retired
domains and remain useful for migration or troubleshooting.

## Implementation Order

1. Verify DNS, TLS, Vercel ownership, and the production deployment on `www`.
2. Update Vercel's production environment and redeploy.
3. Update Supabase and Google authentication settings while temporarily keeping
   the old production callback available.
4. Update Stripe, DocuSeal, and partner endpoints.
5. Apply the tracked repository changes and regenerate the Xcode project.
6. Update ignored local configuration and test a physical-device build.
7. Change the GitHub TestFlight `IOS_API_BASE_URL` variable to `www`.
8. Upload a new TestFlight build and complete web, OAuth, API, deep-link,
   Bluetooth, payment, signing, and partner-flow smoke tests.
9. Remove obsolete old-domain callback entries after successful verification.

## Verification Checklist

- `https://www.perfectppi.com` returns the expected production application.
- The AASA endpoint returns HTTP 200 directly, without a redirect, and has the
  correct JSON content type and application identifier.
- Web sign-up, sign-in, sign-out, password reset, and OAuth callbacks remain on
  `www`.
- The TestFlight app loads Supabase-backed data through the `www` API origin.
- Universal links open the installed iOS app for every declared AASA path.
- Native OAuth returns through `perfectppi://callback`.
- Stripe Checkout success, cancellation, and signed webhooks work.
- DocuSeal signing and signed webhooks work.
- DealerSpace inspection creation, account linking, outbound delivery, and
  generated application URLs work.
- Canonical metadata, `robots.txt`, sitemap URLs, legal links, and shared media
  links use `www`.
- No production configuration still generates `perfectppi.vercel.app` or the
  non-canonical apex origin.

## Rollback

If a production-critical flow fails, restore both Vercel
`NEXT_PUBLIC_SITE_URL` and GitHub `IOS_API_BASE_URL` to
`https://perfectppi.vercel.app`, redeploy the web application, and retain the
old Supabase redirect entry until the issue is understood. Do not rotate signing
or webhook secrets merely to roll back a hostname change.
