# PerfectPPI Automatic TestFlight Releases

PerfectPPI uploads a new iOS build to App Store Connect whenever a commit that
changes `mobile-app/**` lands on `main`, regardless of who authored or pushed
it. A web-only commit does not start a TestFlight release. A pull request runs
the quality checks, then triggers a release after merge only when its merged
changes include a file under `mobile-app/`.

The workflow is `.github/workflows/testflight.yml`. It can also be run manually
from GitHub Actions without making an empty commit.

## What The Workflow Does

For each qualifying `main` commit, GitHub Actions:

1. Checks out the exact triggering commit.
2. Installs the locked pnpm dependencies.
3. Runs the TypeScript checks and unit tests.
4. Creates the client-safe iOS `AppConfig.plist` from GitHub secrets.
5. Generates `PerfectPPI.xcodeproj` from `mobile-app/project.yml` with XcodeGen.
6. Resolves the exact Swift package versions in the tracked Xcode workspace
   `Package.resolved` file.
7. Runs the native iOS unit tests in an iPhone simulator.
8. Assigns a unique CI build number without editing the repository.
9. Imports a matched Apple Distribution certificate and App Store provisioning
   profile into temporary runner storage.
10. Archives `com.perfectppi.app` as a Release build for team `79P499H2M4`.
11. Verifies the archive's bundle ID, build number, signing identifier, and
    embedded production API configuration.
12. Uploads the verified archive to App Store Connect.

Only the newest `main` run is kept when several commits arrive close together.
Older in-progress runs are cancelled so an obsolete build does not finish after
a newer one.

Pull requests aimed at `main` run the web quality checks, but they never receive
Apple secrets and never upload an iOS build. Only a commit on `main` can enter
the TestFlight job.

The `push.paths` allowlist is intentionally limited to `mobile-app/**`. Changes
to the website, server routes, Supabase files, documentation, or other root
files therefore do not produce a redundant iOS binary. A manual
`workflow_dispatch` run remains available for release-pipeline maintenance or
an emergency rebuild. If iOS later compiles or bundles a shared file outside
`mobile-app/`, add that path to the allowlist before relying on it.

An Actions success means Apple accepted the upload. Apple still has to process
the build before it appears in TestFlight. TestFlight builds expire after 90
days.

## One-Time Apple Setup

### 1. Confirm the existing app record

In App Store Connect, open **Apps > PerfectPPI** and confirm:

- Apple app ID: `6806023496`
- Bundle ID: `com.perfectppi.app`
- Team ID: `79P499H2M4`

Do not create another PerfectPPI app record or another production bundle ID.

In Apple Developer **Certificates, Identifiers & Profiles**, open the existing
`com.perfectppi.app` identifier and keep these capabilities enabled:

- Associated Domains
- Push Notifications
- Sign in with Apple

### 2. Create a Team App Store Connect API key

Use a **team key**, not an individual key. The key is used to authenticate the
build upload; code signing uses the local certificate and profile configured in
the next section.

1. In App Store Connect, open **Users and Access > Integrations**.
2. If the App Store Connect API is not active, the Account Holder must click
   **Request Access** and wait for Apple to approve it.
3. Open **App Store Connect API > Team Keys**.
4. Click **Generate API Key**.
5. Name it `GitHub TestFlight CI`.
6. Start with the **Developer** role, which can upload builds. Team API keys
   apply across all apps in the account, so do not grant more access than the
   workflow needs.
7. Record the **Issuer ID** and **Key ID**.
8. Download `AuthKey_<KEY_ID>.p8`. Apple allows this private key to be
   downloaded only once.

Store the downloaded key in a password manager after adding it to GitHub. Never
commit it, paste it into a tracked file, or send it to a contributor.

Do not casually replace the Developer-role key with a broad Admin key. A
Developer-role team key can upload builds. The workflow avoids requiring its
cloud-managed distribution permission by installing a matching local
certificate and profile before the final export.

### 3. Create matched local distribution-signing assets

The certificate and profile are both required and must match each other.

1. In Xcode, open **Xcode > Settings > Accounts**.
2. Select the Apple Account and `DnD Solutions & Optimization LLC` team.
3. Open **Manage Certificates** and create an **Apple Distribution**
   certificate if no current one exists.
4. In Keychain Access, open **login > My Certificates**. Confirm the Apple
   Distribution certificate expands to show its private key.
5. Export the certificate and private key as a password-protected `.p12`.
6. In Apple Developer **Certificates, Identifiers & Profiles > Profiles**, click
   `+`, choose **App Store Connect**, and select `com.perfectppi.app`.
7. Select the distribution certificate exported in step 5, name the profile
   `PerfectPPI App Store CI`, generate it, and download the `.mobileprovision`.
   Do not use an `iOS Team Store Provisioning Profile:` profile generated by
   Xcode; the CI archive deliberately uses a manually managed profile.
8. Confirm the downloaded profile includes production push notifications,
   Sign in with Apple, Associated Domains, `beta-reports-active=true`,
   `get-task-allow=false`, and application identifier
   `79P499H2M4.com.perfectppi.app`.

Never commit the `.p12`, `.mobileprovision`, or `.p8` files.

## One-Time GitHub Setup

These steps require repository Admin access.

### 1. Create the protected environment

1. Open the GitHub repository.
2. Go to **Settings > Environments > New environment**.
3. Name it exactly `testflight`.
4. Under **Deployment branches and tags**, allow only `main`.
5. Do not add a required reviewer. A reviewer would make every release wait for
   manual approval, which defeats this automatic workflow.

The workflow job explicitly targets this environment, so its Apple and iOS
configuration secrets are not exposed to the web quality-check job.

### 2. Add required environment secrets

Inside the `testflight` environment, add these under **Environment secrets**:

| Secret | Value |
| --- | --- |
| `APP_STORE_CONNECT_KEY_ID` | Key ID shown next to the team API key |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID shown on the Team Keys page |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Entire raw `.p8` file, including its `BEGIN PRIVATE KEY` and `END PRIVATE KEY` lines |
| `IOS_SUPABASE_URL` | Production Supabase project URL |
| `IOS_SUPABASE_ANON_KEY` | Production Supabase publishable/anonymous client key |
| `APPLE_DISTRIBUTION_CERTIFICATE_BASE64` | Base64-encoded `.p12` containing the active Apple Distribution certificate and private key |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_DISTRIBUTION_PROVISIONING_PROFILE_BASE64` | Base64-encoded App Store `.mobileprovision` that includes the same distribution certificate |

The Supabase key embedded in an iPhone app is necessarily public. It must be the
publishable/anonymous key, never `SUPABASE_SERVICE_ROLE_KEY`. Supabase Row Level
Security remains responsible for protecting data.

### 3. Add the environment variable

Under **Environment variables**, add:

```text
IOS_API_BASE_URL=https://perfectppi.vercel.app
```

Do not use `localhost`, a preview deployment, or the retired
`perfectppi-standalone.vercel.app` address.

On a Mac, encode each binary signing asset without placing it in the repository:

```bash
base64 -i /absolute/path/to/apple-distribution.p12 | pbcopy
base64 -i /absolute/path/to/perfectppi-app-store.mobileprovision | pbcopy
```

The workflow validates the profile's team, bundle ID, distribution
entitlements, Sign in with Apple (strict unless
`TESTFLIGHT_ALLOW_MISSING_APPLE_SIGN_IN=true`, see the failure guide),
Associated Domains, expiration, manual management, and certificate
fingerprint before it builds. It imports the
certificate into an ephemeral keychain, installs the profile only for the
duration of the job, and removes both afterward.

## One-Time TestFlight Tester Setup

Uploading a build and distributing it to testers are separate Apple operations.
Configure automatic distribution once:

1. Open **App Store Connect > Apps > PerfectPPI > TestFlight**.
2. Click the `+` next to **Internal Testing**.
3. Create an internal group such as `PerfectPPI Internal`.
4. Check **Enable automatic distribution**.
5. Add the App Store Connect users who should receive every build.
6. Each person accepts Apple's invitation on the same Apple Account used by the
   TestFlight app on their iPhone.

This automatic group is for internal testers. External TestFlight groups still
involve Apple's beta review and should be managed as a separate release lane.

## Turn The Workflow On

After the Apple key, GitHub environment, secrets, variable, and internal tester
group are ready:

1. Commit and push the workflow files to `main`.
2. Open **GitHub > Actions > Ship iOS to TestFlight**.
3. Open the run created by that push.
4. Confirm both jobs pass: **Web quality checks** and **Archive and upload iOS**.
5. Open the deployment link in the job or App Store Connect **TestFlight**.
6. Wait for Apple processing. The internal group receives the build when it is
   ready.

If the first push happened before the environment secrets were configured, use
**Run workflow**, select `main`, and click **Run workflow**. Do not create an
empty commit just to retry.

## Normal Daily Use

No Xcode or TestFlight action is needed for ordinary updates:

1. A contributor pushes or merges a commit affecting `mobile-app/**` into
   `main`.
2. GitHub Actions tests, archives, signs, verifies, and uploads it.
3. Apple processes it.
4. TestFlight automatically offers it to the internal group.

Commits on feature branches are deliberately not uploaded. This prevents
unfinished work and every intermediate PR commit from being distributed. The
commit becomes eligible when it reaches `main`. Commits that change only the
web application remain excluded even after they reach `main`.

The workflow derives a unique build number from the GitHub Actions run and retry
number, starting above the repository's older single-digit builds. To start a
new public app version, change `MARKETING_VERSION` in
`mobile-app/project.yml`; CI continues to assign the TestFlight build number.

## Recommended Main-Branch Protection

The repository includes `.github/CODEOWNERS` for signing and release files. In a
GitHub ruleset for `main`, consider requiring:

- a pull request before merging
- the web quality-check status
- code-owner review when release infrastructure changes
- conversation resolution
- no force pushes

With that policy, Anzo's feature-branch pushes will be tested through the normal
PR process and uploaded after merge. Direct pushes can remain allowed if that is
your preferred workflow, but any direct `main` commit will ship to TestFlight.

## Failure Guide

### Missing TestFlight environment value

The named GitHub environment secret or variable is absent or was added at the
repository level under a different name. Add it to the `testflight` environment
with the exact name shown above, then manually rerun the workflow.

### No signing certificate or provisioning profile

Confirm all three local-signing secrets are present. If the certificate was
renewed or an App ID capability changed, export the new `.p12`, generate a new
manual **App Store Connect** profile in the Apple Developer portal, and replace
both binary secrets together. The workflow rejects an expired or Xcode-managed
profile, the wrong bundle ID, missing production entitlements, or a profile
that does not include the supplied certificate.

### "The App Store provisioning profile does not include Sign in with Apple"

The app's Release entitlements request `com.apple.developer.applesignin`, so
Xcode can only sign with a profile generated *after* the capability was
enabled on the App ID. A profile created earlier fails this check (and would
fail the archive step anyway). Fix it in the Apple Developer portal:

1. **Identifiers > `com.perfectppi.app` > Capabilities**: tick **Sign In with
   Apple** (leave it as the primary App ID) and save.
2. **Profiles > `PerfectPPI App Store CI` > Edit > Save**, then download the
   regenerated `.mobileprovision`. Editing an existing profile re-issues it
   with the App ID's current capabilities; the certificate does not change.
3. `base64 -i /path/to/PerfectPPI_App_Store_CI.mobileprovision | pbcopy` and
   replace `APPLE_DISTRIBUTION_PROVISIONING_PROFILE_BASE64` in the
   `testflight` environment.
4. Rerun the workflow. The step log prints the profile's entitlements; the
   archive verification confirms the signed app carries the entitlement.

Sign in with Apple also needs the Apple provider enabled in the hosted
Supabase project (client ID `com.perfectppi.app`) and the `APPLE_SIGN_IN_*`
server variables before the button works end to end.

**Temporary escape hatch (internal testers only).** If a build must go out
before the profile is regenerated, add the `testflight` environment variable
`TESTFLIGHT_ALLOW_MISSING_APPLE_SIGN_IN=true`. The workflow then archives with
the entitlement removed and stamps `PerfectPPIAppleSignInEnabled=NO` into the
app, which hides the Apple button on the login screen. The run shows a warning
and the step summary marks the build. Such a build cannot pass App Review
(Guideline 4.8 requires Sign in with Apple wherever Google sign-in is
offered): do not submit it, and remove the variable as soon as the profile is
fixed so the check becomes strict again.

### Xcode-managed profile error

Exporting from Xcode produces an Xcode-managed profile, which is not suitable
for this manual CI signing flow. Generate a manual **App Store Connect**
profile in the Apple Developer portal as described above and replace
`APPLE_DISTRIBUTION_PROVISIONING_PROFILE_BASE64`.

### Package lock mismatch

A Swift dependency changed in `mobile-app/project.yml` without updating
`mobile-app/PerfectPPI.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`.
Resolve packages locally, review the resulting lockfile, commit it, and rerun
the workflow. Do not remove the lock check.

### Tests fail

The app is not uploaded. Fix the failing TypeScript or Swift test in a new
commit. CI intentionally prevents a known-failing commit from reaching testers.

### Upload succeeds but the build is not visible

Check **App Store Connect > PerfectPPI > TestFlight > Build Uploads**. Apple may
still be processing it. If processing fails, Apple shows the delivery error and
usually emails the account contacts.

### Build appears but testers do not receive it

Open the internal tester group and confirm **Enable automatic distribution** is
on and the tester is a member. The macOS TestFlight app is not where this setting
is configured; use the App Store Connect website.

## Manual Emergency Fallback

The local manual archive instructions remain in
`docs/iphone-local-testing-runbook.md`. Use them only when GitHub Actions or the
Apple API is unavailable. Never apply the Personal Team/local bundle-ID patch to
a TestFlight archive.

## Official References

- [Apple: Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
- [Apple: App Store Connect API](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/)
- [Apple: Cloud-managed certificates](https://developer.apple.com/help/account/certificates/cloud-managed-certificates/)
- [Apple: Add internal testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/)
- [GitHub: Control deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)
