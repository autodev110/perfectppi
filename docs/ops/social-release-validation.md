# Social Release Validation

This is the release acceptance and rollback checklist for sections 32, 33, 37,
and 39 of the social plan. Repository checks are not production approval.
Every manual item starts **unverified**. Assign a person's name, record the
tested build/environment/date, and link restricted evidence before sign-off.
Do not enable beta publication merely because automated checks are green.

## Repository Checks

Run from the repository root:

```bash
npm run typecheck
npm run lint
npm run i18n:check
npm run test:unit
npm run build
python3 mobile-app/scripts/sync-string-catalog.py --check
```

Use the pinned Supabase Database Tests workflow for a fresh migration replay
and all rollback-only SQL tests. SQL tests use psql, not the hosted SQL editor;
do not paste `\set` directives there or run test fixtures against production.
Use the iOS workflow/archive and simulator build instructions for native checks.
This localization completion adds no database migration or provider credentials.

For an extraction-only review, `node tools/check-extracted-copy.mjs <base-ref>`
compares English/protocol literals with a known pre-refactor revision. It is
not a standing assertion that future product copy can never change. Terms
snapshot/hash and disclosure parity are separately enforced by unit tests.

## Manual Evidence Matrix

Use synthetic accounts A/B/C: friends, unrelated members, and distinct private
group memberships. Use synthetic vehicle details and benign media; never use
real illegal material or private customer records as fixtures. Use only the
scanner provider's authorized benign test mechanism for specialist outcomes.
Run applicable cases on web, the current iOS build, the oldest supported app,
and two devices. A denied mutation must not be described as successful.

| Scenario | Required result | Owner | Evidence/status |
| --- | --- | --- | --- |
| Text/photo publication and retry | Draft survives failure; retry yields one post; no partial photo publication | QA/engineering | Unverified |
| Author edits and replies | Rechecks ownership/group eligibility; blocked/restricted clients cannot bypass; replies remain one level | QA/security | Unverified |
| First report and stale content | Exact item hidden from feed, search, saves, detail, shares, and cached media on both devices | QA/security | Unverified |
| Private groups and group rules | Nonmember/removed member denied; rules acknowledgement, slow mode and member restrictions enforced by server | QA/security | Unverified |
| Friends, requests and blocks | Requests separate from inbox; blocks stop new contact; contact caution does not reject prices/mileage | QA | Unverified |
| Vehicle provenance/handoff | Seller sees and approves public preview; buyer verification creates/claims own record; private history never transfers automatically | QA/security | Unverified |
| Media safety outage | Failed/review/timeout scan stays private; old public URL remains denied after removal | QA/T&S | Unverified |
| Moderator capability boundaries | Routine account cannot read reporter identity/export evidence/release holds; authorized decisions produce correct audit revision | Security/T&S | Unverified |
| Session expiry and offline | Airplane mode, timeout, expired session, foreground/background and clock skew recover without lost drafts or false success | QA | Unverified |
| Accessibility | VoiceOver order/focus, largest Dynamic Type, contrast, transparency, motion, Button Shapes, iPad keyboard/pointer and landscape usable | Accessibility owner | Unverified |
| Text/resources | English labels render correctly; no raw keys/placeholders/entities; policy English matches accepted version | QA | Unverified |
| Privacy/analytics | Opt-out stops capture and clears events; aggregates reveal no raw content/identifiers; crash diagnostics shown as counts, never exact rates | Privacy/QA | Unverified |
| Account export/deletion and holds | Export private to owner; participant-aware deletion/revocation works; holds preserved and processor jobs visible | Privacy/security | Unverified |
| Load and scrolling | Synthetic staging dataset exercises cursor continuations/filters/search; oldest iPhone scrolling/memory acceptable | Performance owner | Unverified |
| Kill switches/custom client | Existing app and direct mutation attempts denied after disabling creation; caches cannot bypass | Release/security | Unverified |
| Backup/restore and purge retry | Restore respects deletion tombstones; partial cleanup retries; no hold evidence purged | Operations/privacy | Unverified |

For load evidence, record synthetic dataset size, concurrent users, media sizes,
device/OS, sample count, API P50/P95/P99, query time, upload completion and memory.
Measure an approved beta-sized dataset before setting budgets. Follow
[`docs/reliability-monitoring.md`](../reliability-monitoring.md); a local build
or empty-database test does not establish production load performance.

## Operational Sign-Off

- [ ] Release owner: attach the exact commit, migration deployment record and enabled flag version; review Admin > Social Readiness.
- [ ] T&S owner: name roster/coverage/escalation contacts; verify least-privilege capability coverage and received SLA alerts.
- [ ] Media safety owner: configure `CHILD_SAFETY_SCANNER_URL`/`TOKEN` server-side and approve response/outage/reporting workflow; otherwise keep new Community photos disabled.
- [ ] Policy owner: approve the versioned targeted-term and blocked-host lists; do not assume empty lists provide specialist coverage.
- [ ] Privacy/counsel: approve ordinary `community_safety` retention and legal-hold/release/purge policy; resolve applicable company and state-specific questions in the compliance register.
- [ ] Operations: verify R2 private delivery, retired-URL denial, worker heartbeats, cleanup/retry/dead letters, CRON_SECRET and monitored alert delivery.
- [ ] Mobile/release owner: verify Apple production configuration/profile, archive privacy answers, AASA/domain links and monitored Support contacts.
- [ ] Engineering/QA: attach the manual matrix and measured performance budgets; no accessibility conformance claim before acceptance.
- [ ] Incident owner: perform the rollback drill below and record restoration approval.
- [ ] Product/counsel: confirm disclosures match actual flags; approve beta release explicitly.

None of these approvals is supplied by this document. Open items remain in
[`docs/compliance/open-questions.md`](../compliance/open-questions.md) and
[`docs/compliance/retention-schedule.md`](../compliance/retention-schedule.md).

## Rollback Drill

1. In staging, record build/flag versions and establish text/photo/group/event
   creation plus message attachment baselines using synthetic accounts.
2. Disable affected creation flags in Admin > Feature Flags. If that path is
   unavailable, deploy `PERFECTPPI_EMERGENCY_OFF` with the affected comma-separated
   flag codes documented in `.env.example`. Verify the active deployment,
   not merely the dashboard's saved environment value.
3. Verify `/api/capabilities` and direct mutations from current/older/custom
   clients deny the affected operations. Preserve drafts and useful errors.
   Do not disable `report_auto_hide` or weaken private media/status checks.
4. Keep reporting, authorized evidence access and cleanup/retention workers
   operating. Disabling creation alone does not remove an already unsafe item;
   use the audited moderation/containment flow as needed.
5. Record alert receipt, propagation timing and incident-owner acknowledgement.
   Never reverse applied migrations or make restricted media public to roll back.
6. Restore creation only after the incident/release owner approves and the
   failed scenario plus relevant security tests pass. Record build and flags.

## Deliberate Scope Decisions

Keep MetricKit. The owner deferred exact crash-free session rates; delayed
diagnostic counts are not session-attributed. No Sentry or additional provider
is required by this release. Community video and algorithmic feed ranking
remain off. English is the only shipped language; additional catalogs need
translation approval, locale-binding review and expansion testing. Messages
have no delete-for-self/unsend control and retain participant/evidence semantics.
