# Release Gap Closure

Repository work completed October 15, 2026. External approvals and dashboard
configuration are separate from this implementation record.

## Implemented

- iOS review displays urgent/service findings from the same deterministic rules
  used in reports. The server authorizes the inspector and returns a revision;
  iOS refuses to certify a review whose answers changed during loading.
- Current iOS strings are extracted into the catalog and CLI tools are typechecked.
- Tracked API/public-domain defaults and Debug/Release Associated Domains use
  `www.perfectppi.com`. Explicit deployment variables still override defaults.
- Scanner requests refuse redirects and credentials in URLs; response size and
  request duration are bounded. The gateway still requires an actual specialist
  provider, rather than manufacturing a clean verdict.
- Connection revocation atomically ends consent attempts, user links, and queued
  deliveries. Recoverable webhook secrets/callbacks are cleared on revocation.
- The daily retention worker removes terminal delivery logs (and their delivery
  attempts) and expired link transactions only after an approved period is
  recorded. Legal holds preserve affected records. Purges record aggregate
  counts in the private append-only `partner_retention_purge_runs` table.
- Before Auth deletion, a signed instruction is durably stored outside the
  database in private R2. Restore tooling validates the signature and recreates
  the ordinary held/retrying deletion request. It also detects restored Auth
  users whose profile is absent. No names, emails, photos or message content are
  included in a journal.

Apply `20261014194447_release_retention_and_restore_replay.sql` before deploying
this code. It is an additive migration and must not be reversed for rollback.

## Operator Tools

- `node tools/check-release.mts`: read-only public site, direct AASA,
  legal/support, and unauthorized worker checks.
- `node --env-file=.env.local tools/check-child-safety.mts --help`: approved
  benign fixture acceptance against the configured gateway; output is only
  configuration/verdict/expected/pass status. Match fixtures must come from the
  selected provider's authorized test mechanism.
- `node tools/measure-api-load.mts --help`: bounded concurrent staging GETs with
  a synthetic test account; reports error counts and P50/P95/P99 transfer times.
  Supply every path/filter/continuation variant you want measured. It does not
  generate production data or establish a load budget by itself.
- `node tools/replay-deletion-journal.mts --help`: inspect, queue and verify
  deletion instructions after restore. Default mode does not mutate records.

The public release probe passed on October 14. This does not verify OAuth,
TestFlight's configured override, payments, document signing or provider keys.

## Verification

- All 452 unit tests, app/test/tool type checks, ESLint and the production web
  build passed.
- All 72 SQL suites passed after replaying every application migration in an
  isolated disposable database with the required official Auth baseline.
  New retention/recovery operations are also tested as `service_role`, including
  missing profiles, identity mismatch, legal holds and idempotent replay.
- Supabase public-schema function lint returned no errors.
- The iOS simulator test run passed 18 unit/render tests and one launch UI test;
  web and iOS string extraction checks passed.

These automated results do not substitute for provider-backed acceptance, a
live private-R2 deletion/restore drill, or physical-device/manual accessibility
validation. No production records were changed by verification.

## Retention Setup

In Admin > Moderation > Retention, a designated reviewer records an approved
period/reference using `partner_delivery` and `partner_link_transactions`.
No periods are invented or enabled by this migration. Inspection snapshots and
deliverables still follow the inspection's lifecycle; these policies remove
delivery transport logs and transient linking records, not the inspection.

Set `PRIVACY_DELETION_JOURNAL_KEY` to a stable server-only secret before the first
new deletion. If absent, `LEGAL_EVIDENCE_SALT`, then the service-role key, is used
for compatibility. Preserve the effective key across Supabase key rotation and
restores; changing it requires a deliberate journal re-signing migration.
Journal writes require private R2. A failed write blocks Auth deletion and retries.

Keep the journal prefix outside owner-media cleanup, backup restores, and R2
lifecycle expiration rules. Its disposal period must cover every recoverable
database backup and restore window and needs the responsible owner's approval.
The code deliberately does not expire these instructions on an assumed date.

## Restore Procedure

1. Disable application access to the restored project, including direct Data API
   and Auth access. Keep it isolated throughout the procedure.
2. Restore the database and apply the current migrations. Keep the original
   private journal bucket and effective signing key, independent of the restore.
3. Point a restricted operator environment at the restored project and original
   journal bucket. Inspect with
   `node --env-file=<operator-env> tools/replay-deletion-journal.mts --project-ref <ref>`.
4. Add `--apply` to queue valid restored deletions. This does not report them as
   completed. Run the normal authenticated storage/privacy worker until its
   deletion queue has settled; held cases need the existing restricted workflow.
   The tool checks Auth through the supported Admin API; the service-only SQL
   function does not grant the worker direct access to Supabase Auth tables.
5. Run the replay tool with `--verify`. It exits nonzero while any journaled Auth
   account still exists. Keep held identities/data isolated; do not reopen access
   while this check fails. Check the storage cleanup queue too.
6. Reopen traffic only after privacy/security restoration approval and the other
   release checks. Journals cannot reconstruct instructions for accounts deleted
   before this feature existed; reconcile those against separately retained
   privacy-request records before using an older backup.

## External Items Still Required

- Specialist provider approval, credentials/API contract and authorized fixtures.
  PhotoDNA's private API must not be guessed; connect its approved adapter to
  the existing HTTPS gateway once documentation is supplied.
- Recorded retention durations, backup expiry, company/policy/counsel decisions,
  moderator roster/capabilities, monitored alerts and a rollback drill.
- Production environment/callback settings, R2 CORS, Apple profile/provider,
  App Store privacy answers, and physical-device/accessibility/load acceptance.
- Community video, algorithmic ranking, extra languages and exact crash-free
  rates remain the previously approved deferrals.
