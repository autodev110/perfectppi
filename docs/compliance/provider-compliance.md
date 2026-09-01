# Identity and Platform Compliance Runbook

Status: code implementation pending dashboard configuration and provider acceptance testing.

## Google production checklist

- Homepage: `https://www.perfectppi.com/`
- Privacy: `https://www.perfectppi.com/privacy`
- Terms: `https://www.perfectppi.com/terms`
- Authorized domain: `perfectppi.com`
- JavaScript origin: `https://www.perfectppi.com`
- Provider callback: `https://rnufzjpswyqxdkciglbi.supabase.co/auth/v1/callback`
- Supabase Site URL: `https://www.perfectppi.com`
- App callback: `https://www.perfectppi.com/callback`
- Scopes only: `openid`, `userinfo.email`, `userinfo.profile`
- Audience: external/production; branding must say PerfectPPI and use the same public links.
- Search Console ownership and Branding/Verification Center must be completed by the owning account.
- Keep client secret server/provider-side. Never put it in mobile plist, browser code, screenshots or Git.

Tests: first login, repeat login, canceled login, logout, legal gate, Google disconnect with second identity, last-identity rejection, Google-side revoke, account deletion request, and callback allowlist rejection.

## Apple launch blocker

Google is offered on iOS, but Sign in with Apple is not configured. Required before App Store submission:

1. Confirm Apple Team ID and explicit native App ID/bundle ID.
2. Enable Sign in with Apple entitlement and capability.
3. Create associated Services ID and configure Supabase domain/return URL.
4. Configure Supabase allowed client IDs in required order and upload a generated ES256 client-secret JWT, never the `.p8` key.
5. Add native `AuthenticationServices` flow with nonce/state and an Apple button at least as prominent as Google.
6. Register sending domains/addresses for Private Email Relay and verify SPF/DKIM.
7. Implement Apple refresh-token revocation before final local deletion per [TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple).
8. Own monitored client-secret rotation before expiry, with dry run and failure alert.
9. Verify current Supabase support for Apple server-to-server notifications. Do not configure a fake endpoint.

Tests: Share Email, Hide My Email, canceled and repeat login, missing repeat-login name, duplicate identity, explicit linking, revoked credential state, relay delivery, deletion/revocation and rotation.

## App Store privacy

Reconcile the final archive and `PrivacyInfo.xcprivacy` with App Store Connect. Current declared classes include name, email, user ID, photos/video, other user content, device ID and purchase history, all linked and not used for tracking. Confirm SDK manifests and required-reason API reports from the archive; do not rely only on source inspection.

## Supabase controls

- Publishable/anon keys may be client-side; service-role keys must remain server-only.
- Deploy and verify RLS for `legal_acceptances` and `privacy_requests`.
- Administrative Auth deletion and vendor propagation must run only in a protected server worker.
- Do not automatically merge Apple Hide My Email identities by matching email alone.
- Document Site URL, redirect allowlist, email confirmation, session duration, MFA/admin access, backups, logs and region.

