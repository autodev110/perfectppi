# PerfectPPI Automatic TestFlight Releases

PerfectPPI uploads a new iOS build to App Store Connect whenever a commit lands
on `main`, regardless of who authored or pushed it. A direct push by Dan or Anzo
triggers the workflow. A pull request triggers it when the pull request is
merged into `main`.

The workflow is `.github/workflows/testflight.yml`. It can also be run manually
from GitHub Actions without making an empty commit.

## What The Workflow Does

For each new `main` commit, GitHub Actions:

1. Checks out the exact triggering commit.
2. Installs the locked pnpm dependencies.
3. Runs the TypeScript checks and unit tests.
4. Creates the client-safe iOS `AppConfig.plist` from GitHub secrets.
5. Generates `PerfectPPI.xcodeproj` from `mobile-app/project.yml` with XcodeGen.
6. Resolves the exact Swift package versions in the tracked Xcode workspace
   `Package.resolved` file.
7. Runs the native iOS unit tests in an iPhone simulator.
8. Assigns a unique CI build number without editing the repository.
9. Archives `com.perfectppi.app` as a Release build for team `79P499H2M4`.
10. Verifies the archive's bundle ID, build number, signing identifier, and
    embedded production API configuration.
11. Uploads the verified archive to App Store Connect.

Only the newest `main` run is kept when several commits arrive close together.
Older in-progress runs are cancelled so an obsolete build does not finish after
a newer one.

Pull requests aimed at `main` run the web quality checks, but they never receive
Apple secrets and never upload an iOS build. Only a commit on `main` can enter
the TestFlight job.

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

### 2. Create a Team App Store Connect API key

Use a **team key**, not an individual key. Individual keys cannot perform all
Certificates, Identifiers & Profiles operations needed by automatic signing.

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

The workflow first tries Xcode's cloud-managed distribution signing. Ensure the
Apple team permits Developers to use cloud-managed distribution certificates.
If Apple rejects cloud signing for the Developer-role key, either grant the
needed cloud-signing permission or configure the optional local distribution
certificate described below. Do not casually replace the key with a broad Admin
key.

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

### 4. Optional local Apple Distribution certificate

Skip this section while cloud-managed signing works. It is a fallback for an
Apple team that does not allow the API key to use cloud-managed certificates.

Export an active **Apple Distribution** certificate together with its private
key from Keychain Access as a password-protected `.p12`. Then create both of
these `testflight` environment secrets:

| Secret | Value |
| --- | --- |
| `APPLE_DISTRIBUTION_CERTIFICATE_BASE64` | Base64-encoded `.p12` bytes |
| `APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |

On a Mac, encode the certificate without placing it in the repository:

```bash
base64 -i /absolute/path/to/apple-distribution.p12 | pbcopy
```

Set both optional secrets or neither. The workflow imports the certificate into
an ephemeral keychain and deletes it after the job.

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

1. A contributor pushes or merges a commit into `main`.
2. GitHub Actions tests, archives, signs, verifies, and uploads it.
3. Apple processes it.
4. TestFlight automatically offers it to the internal group.

Commits on feature branches are deliberately not uploaded. This prevents
unfinished work and every intermediate PR commit from being distributed. The
commit becomes eligible when it reaches `main`.

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

Confirm the API key is a team key, the key role can upload builds, the bundle ID
belongs to team `79P499H2M4`, and automatic signing is allowed. If the team
cannot use cloud signing in CI, configure both optional distribution-certificate
secrets.

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
