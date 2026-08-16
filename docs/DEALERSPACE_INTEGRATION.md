# Perfect PPI ↔ DealerSpace Integration — Perfect PPI side

This is the reference for the partner integration implemented in this
repository. It documents the contract DealerSpace must implement against, the
environment it needs, and how to run the acceptance tests locally.

Perfect PPI is the inspection system of record. DealerSpace pushes one
explicitly selected vehicle, Perfect PPI performs the inspection and generates
the deliverables, and DealerSpace pulls the finished artifacts back over an
authenticated API. Neither system ever touches the other's database, storage
credentials, or Supabase keys.

---

## 1. The three mappings

They solve different problems and are deliberately kept separate.

| Mapping | Table | Purpose |
|---|---|---|
| DealerSpace org → Perfect PPI org | `partner_connections` | Authorizes all server-to-server traffic |
| DealerSpace staff → Perfect PPI profile | `partner_user_links` | Assigns the inspection to the same human |
| DealerSpace phase → Perfect PPI request | `external_inspection_refs` | Routes statuses and artifacts back |

Report delivery depends only on the **connection** and the **external inspection
reference**. A technician who leaves, unlinks, or logs out never blocks a
delivery.

---

## 2. Environment variables

### Required for the integration

| Variable | Purpose |
|---|---|
| `PARTNER_SECRET_ENCRYPTION_KEY` | AES-256-GCM key for webhook signing secrets at rest. Base64 of exactly 32 bytes: `openssl rand -base64 32`. Without it, connections cannot be created. |
| `CRON_SECRET` | Bearer token Vercel Cron presents to the worker endpoints. Without it (and without `WORKER_SECRET`) the workers refuse to run. |
| `WORKER_SECRET` | Optional second credential for manually triggering a worker via `x-worker-secret`. Defaults to `CRON_SECRET`. |

### Already required by the app, now also load-bearing for the integration

| Variable | Why it matters here |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | User-scoped clients; RLS enforcement |
| `SUPABASE_SERVICE_ROLE_KEY` | Partner API routes and workers. **Server only** — never expose it |
| `GEMINI_PERFECTPPI` or `GEMINI_API_KEY` | Report and VSC generation. A missing key fails the job permanently with a clear error rather than crashing the module |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | Artifact storage. Required — the pipeline refuses to run without it |
| `NEXT_PUBLIC_SITE_URL` | Builds the deep link returned to DealerSpace and the account-linking authorization URL |

### Development only

| Variable | Purpose |
|---|---|
| `PARTNER_ALLOW_INSECURE_CALLBACKS=true` | Permits `http://` and loopback webhook/callback URLs. **Never set in production** — it disables the SSRF guard's private-address rejection for localhost |

---

## 3. Migrations

| File | Contents |
|---|---|
| `037_organization_ownership.sql` | `vehicles.owner_id`/`ppi_requests.requester_id` nullable, organization ownership columns, XOR constraints, tenancy helpers, immutability triggers, org read policies |
| `038_partner_connections.sql` | Installation codes, connections, user links and link transactions, external inspection refs, rate-limit buckets |
| `039_output_jobs_artifacts_events.sql` | Output generation jobs, immutable artifacts, outbound events, delivery attempts, atomic claim functions |
| `040_partner_integration_rls.sql` | RLS for every new table, explicit grants, and a guard that fails the migration if any table is left unprotected |
| `041_partner_rpcs.sql` | Transactional inspection creation, job enqueueing, snapshot correction, delivery requests |
| `042_output_job_reconciliation.sql` | Recovery sweep for submissions whose enqueue never landed |

After applying them, regenerate the database types:

```bash
supabase gen types typescript --local --schema public > src/types/database.ts
```

---

## 4. API surface

Base path `/api/v1/partner`. All routes authenticate with
`Authorization: Bearer <connection-token>` except the exchange endpoint, where
the installation code *is* the credential.

| Method | Path | Scope | Purpose |
|---|---|---|---|
| POST | `/connections/exchange` | — | Trade an installation code for credentials (once) |
| GET | `/connections/self` | `inspections:read` | Verify the connection; stamps `last_verified_at` |
| POST | `/user-links` | `inspections:create` | Start account linking; returns a browser URL |
| POST | `/user-links/exchange` | `inspections:create` | Redeem the authorization code |
| GET | `/user-links/:externalUserId` | `inspections:read` | Link status |
| DELETE | `/user-links/:externalUserId` | `inspections:create` | Revoke a link (idempotent) |
| POST | `/inspections` | `inspections:create` | Create an inspection (requires `Idempotency-Key`) |
| GET | `/inspections/:id` | `inspections:read` | Current status and readiness |
| PATCH | `/inspections/:id/vehicle` | `inspections:create` | Explicit snapshot correction, pre-submission only |
| GET | `/inspections/:id/deliverables` | `artifacts:read` | Manifest for the newest complete output version |
| GET | `/artifacts/:artifactId` | `artifacts:read` | Stream authenticated bytes |

### Error codes

DealerSpace should branch on the `error` field, not on the message.

`missing_credentials`, `invalid_credentials`, `connection_revoked`,
`insufficient_scope`, `organization_mismatch`, `invalid_request`, `invalid_vin`,
`missing_idempotency_key`, `user_link_required`, `invalid_user_link`,
`link_callback_not_configured`, `invalid_authorization_code`,
`authorization_expired`, `invalid_installation_code`,
`installation_code_expired`, `installation_code_already_used`,
`connection_already_exists`, `invalid_callback_url`, `inspection_not_found`,
`artifact_not_found`, `deliverables_not_ready`, `idempotency_conflict`,
`snapshot_locked`, `rate_limited`, `storage_unavailable`, `internal_error`.

An inspection belonging to another dealership returns `inspection_not_found`,
identical to one that does not exist. Existence is never disclosed.

### Rate limits

Fixed 60-second windows, counted in Postgres so they hold across instances:
10/min for code exchange (per client IP), 60/min for writes, 240/min for reads
(both per connection). A `429` carries `Retry-After`.

---

## 5. Connecting an organization

1. A Perfect PPI **organization manager** opens *Organization → Settings* and
   generates an installation code. It is shown once, valid 30 minutes, single
   use, and only its SHA-256 hash is stored.
2. A **DealerSpace administrator** enters it in DealerSpace.
3. The DealerSpace **backend** exchanges it:

```http
POST /api/v1/partner/connections/exchange
Content-Type: application/json

{
  "code": "PPI-XXXXX-XXXXX-XXXXX-XXXXX",
  "externalOrganizationId": "dms-org-id",
  "displayName": "Alpha Motors DealerSpace",
  "webhookUrl": "https://dealerspace.example.com/api/integrations/perfectppi/webhook",
  "userLinkRedirectUri": "https://dealerspace.example.com/settings/perfectppi/callback"
}
```

Response (`201`) contains `token` and `webhookSecret` **exactly once**. Store
both encrypted at rest. There is no way to read them back; a lost credential is
rotated by the Perfect PPI manager, which invalidates the old one immediately.

Both URLs are validated at registration and re-validated before every outbound
request: HTTPS only, no embedded credentials, and the hostname must not resolve
to a loopback, link-local, RFC1918, CGNAT, or otherwise reserved address.
Callback destinations are always resolved from the stored connection — a request
payload can never supply one.

One live connection per Perfect PPI organization and one per DealerSpace
organization; a second attempt returns `connection_already_exists`.

---

## 6. Linking a technician's account

The two accounts stay separate. There is no password or session sharing, and a
matching email address never authorizes or silently creates a link.

1. DealerSpace backend: `POST /user-links` with `{ "externalUserId": "staff-1" }`
   → `{ authorizationUrl, state, expiresAt }` (15 minutes).
2. DealerSpace opens `authorizationUrl` for the technician.
3. The technician signs in to their **existing** Perfect PPI account.
4. Perfect PPI shows a consent screen and verifies the signed-in account has a
   valid profile, technician access, and active membership of the organization
   bound to the connection.
5. On *Authorize*, Perfect PPI redirects **only** to the callback registered on
   the connection, carrying a single-use `code` (2 minutes) and the `state`.
6. DealerSpace backend: `POST /user-links/exchange` with `{ code, state }` →
   the durable mapping.

Eligibility is re-verified at redemption, not just at consent. A code issued for
one connection cannot be redeemed with another connection's token.

---

## 7. Creating an inspection

```http
POST /api/v1/partner/inspections
Authorization: Bearer <connection-token>
Idempotency-Key: <dealer-org>:<recon-case>:<inspection-phase>
Content-Type: application/json

{
  "externalOrganizationId": "dms-org-id",
  "externalReconCaseId": "recon-case-id",
  "externalVehicleId": "vehicle-id",
  "externalInspectionPhaseId": "phase-id",
  "externalActorId": "dms-staff-id",
  "source": { "system": "dealerspace", "label": "DealerSpace Inspection" },
  "vehicle": {
    "vin": "1HGCM82633A004352",
    "stockNumber": "A1024",
    "year": 2023, "make": "Toyota", "model": "Camry", "trim": "SE",
    "mileage": 24150,
    "exteriorColor": "White", "interiorColor": "Black",
    "engine": "2.5L", "transmission": "Automatic", "drivetrain": "FWD"
  }
}
```

```json
{
  "inspectionId": "ppi-request-id",
  "status": "assigned",
  "appUrl": "https://perfectppi.com/tech/ppi/ppi-request-id",
  "assignedTechnician": { "profileId": "...", "displayName": "..." },
  "created": true
}
```

Notes:

- `Idempotency-Key` is **required**. A replay with an equivalent payload returns
  `200` with `created: false` and the original inspection. The same key with a
  materially different payload returns `409 idempotency_conflict` and changes
  nothing.
- `externalActorId` is resolved through `partner_user_links`. A Perfect PPI
  profile id supplied directly is never accepted. Missing link →
  `409 user_link_required`; wrong organization or non-technician →
  `409 invalid_user_link`.
- The payload schema is strict. Unknown fields are rejected, so customer, lead,
  deal, pricing, and finance data cannot be stored by accident.
- VINs are validated including the check digit.
- The vehicle data becomes an **immutable snapshot** on the reference. Later
  DealerSpace edits do not reach an inspection already underway. The database
  enforces this with a trigger; the only sanctioned change is
  `PATCH /inspections/:id/vehicle`, which is refused once the technician has
  submitted (`409 snapshot_locked`).

---

## 8. Deliverables

Four artifacts are required before an inspection is deliverable:

```text
inspection_report_json     canonical machine-readable report
inspection_report_pdf      immutable human-readable record
vsc_determination_json     canonical machine-readable determination
vsc_determination_pdf      immutable human-readable record
```

The manifest only ever describes an output version that has **all four**. A
version missing one is never offered, so DealerSpace cannot import a partial set
and close its Recon phase on it.

```json
{
  "inspectionId": "ppi-request-id",
  "submissionId": "submission-id",
  "version": 1,
  "generatedAt": "2026-08-14T12:00:00Z",
  "artifacts": [
    {
      "id": "artifact-uuid",
      "type": "inspection_report_json",
      "contentType": "application/json",
      "sizeBytes": 18240,
      "sha256": "…",
      "downloadPath": "/api/v1/partner/artifacts/artifact-uuid"
    }
  ]
}
```

Each `sha256` is computed over exactly the bytes stored, so DealerSpace can
verify a download before accepting it. The artifact route also echoes
`X-PerfectPPI-Artifact-Sha256` and `X-PerfectPPI-Output-Version`.

Artifact records are append-only — a checksum a partner has recorded can never
be rewritten. Manual regeneration creates a **new** output version and leaves
earlier versions intact.

---

## 9. Webhooks

Perfect PPI only notifies; DealerSpace pulls. No artifact bytes travel by
webhook.

```json
{
  "eventId": "evt_...",
  "type": "inspection.deliverables_ready",
  "occurredAt": "2026-08-14T12:00:00Z",
  "inspectionId": "ppi-request-id",
  "deliveryVersion": 1
}
```

Headers:

```text
X-PerfectPPI-Connection    the connection id
X-PerfectPPI-Event-Id      evt_… — deduplicate on this
X-PerfectPPI-Timestamp     unix seconds
X-PerfectPPI-Signature     v1=<hex hmac-sha256>
```

The signature covers `timestamp + "." + rawRequestBody`. Verify against the
**raw** body — re-serializing parsed JSON will not reproduce the digest:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyPerfectPpiWebhook(
  rawBody: string,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const timestamp = headers["x-perfectppi-timestamp"];
  const presented = headers["x-perfectppi-signature"];
  if (!timestamp || !presented?.startsWith("v1=")) return false;

  // Reject stale replays.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const received = presented.slice(3);

  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}
```

Delivery is **at-least-once**: DealerSpace must deduplicate on `eventId` and
tolerate duplicates and out-of-order arrival. 5xx, 429, 408, timeouts and
network errors are retried with exponential backoff up to 8 attempts; other 4xx
responses and redirects are treated as permanent (fix the endpoint and press
*Send* again). Every attempt is recorded in `webhook_delivery_attempts`.

Event vocabulary: `inspection.created`, `inspection.assigned`,
`inspection.accepted`, `inspection.started`, `inspection.submitted`,
`inspection.outputs_generating`, `inspection.deliverables_ready`,
`inspection.delivery_requested`, `inspection.delivered`,
`inspection.needs_revision`, `inspection.cancelled`,
`inspection.delivery_failed`.

---

## 10. Workers

Output generation is a durable job, not a fire-and-forget promise. Submitting
enqueues exactly one job per `(submission, output_version)`; a retry resumes the
same version and reuses artifacts that already succeeded.

Two cron entries in `vercel.json` drive the queues:

```text
/api/internal/workers/outputs      */5 * * * *
/api/internal/workers/deliveries   */5 * * * *
```

> Vercel Cron on the Hobby plan only supports daily schedules. On Hobby, either
> upgrade or point an external scheduler at the same endpoints with the
> `x-worker-secret` header.

The submit route and the *Send to DealerSpace* action also kick a worker inline
for latency — via `after()`, which keeps the function alive, rather than an
unawaited promise the platform may kill. The cron remains the guarantee.

Jobs are claimed with `FOR UPDATE SKIP LOCKED` under a lease, so concurrent
workers never double-process and a worker that dies mid-flight releases its job
when the lease expires.

The outputs tick also runs a **reconciliation sweep** before claiming: if the
post-submit enqueue itself failed, the submission would otherwise sit with no
job and nothing to find it. The sweep looks for submitted inspections between
two minutes and seven days old that have no job and no complete artifact set,
and enqueues one — reusing the latest existing output version rather than
minting a new one. Older submissions are left alone; use the Retry control.

The deliveries tick prunes rate-limit buckets older than an hour and linking
attempts that expired unused more than seven days ago. Consumed and revoked
link transactions are kept as the authorization audit trail.

### Retry versus regenerate

Two different actions, and confusing them produces two competing report
versions for one inspection:

| Action | Endpoint | Behaviour |
|---|---|---|
| Retry | `POST /api/ppi/outputs/retry` | Resumes the *pending* version. Reuses artifacts that already succeeded. This is what the "still generating" and "failed" UI calls. |
| Regenerate | `POST /api/ppi/outputs/regenerate` | Deliberately mints a **new** immutable output version. Only offered where a report already exists. |

Manual trigger:

```bash
curl -X POST "$SITE_URL/api/internal/workers/outputs" -H "x-worker-secret: $WORKER_SECRET"
```

---

## 11. Security posture

- Partner credentials are server-side only. `SUPABASE_SERVICE_ROLE_KEY`,
  `PARTNER_SECRET_ENCRYPTION_KEY`, R2 credentials, connection tokens and webhook
  secrets never reach the browser or the iOS bundle.
- Connection tokens are stored as SHA-256 hashes; the plaintext is shown once.
  Webhook secrets are encrypted with AES-256-GCM because Perfect PPI must sign
  with them.
- Secret comparison is constant-time, over validated hex digests.
- Tenancy is resolved from the authenticated connection or from the user's own
  membership — never from an organization id in a request payload.
- Every new table has RLS enabled. Credential and worker tables have **no
  policies at all** and no client privileges; the non-secret tables get narrow
  read policies plus explicit grants.
- `ppi_requests` and `vehicles` ownership columns, the vehicle snapshot, and the
  artifact records are immutable after creation, enforced by triggers.
- No `SECURITY DEFINER` function was added to work around RLS. The helpers that
  need it answer a single yes/no question about the *calling* user, pin
  `search_path`, and are granted only to `authenticated`. Worker RPCs are
  invoker-rights and granted only to `service_role`.

---

## 12. Running the tests

```bash
# 1. Unit tests — crypto, signatures, SSRF guard. No services needed.
npm run test:unit

# 2. Database acceptance tests — RLS, constraints, idempotency, delivery gate.
#    Point at a local or disposable branch database, never production.
supabase start
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/tests/partner_integration.test.sql

# 3. API acceptance tests — full HTTP flow against the built server.
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
export SUPABASE_SERVICE_ROLE_KEY=<local service role key>
npm run test:api

# 4. Typecheck both the app and the test harness.
npm run typecheck
```

A local `supabase start` image does not always reproduce the table grants a
hosted project has. If step 2 or 3 fails with `permission denied for table …`,
normalize the local database once:

```sql
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
```

then re-apply `supabase/migrations/040_partner_integration_rls.sql`, which
re-asserts the integration tables' lockdown on top.

---

## 13. What DealerSpace must implement

1. Store the connection token and webhook secret **encrypted at rest**.
2. Offer *Connect Perfect PPI* in dealership settings, exchanging the
   installation code from its backend.
3. Offer per-user *Link my Perfect PPI account*, driving the authorization URL
   and exchanging the returned code from its backend.
4. Show *Send to Perfect PPI* in the Recon Inspection phase, sending the vehicle
   snapshot **from the backend** with a stable
   `Idempotency-Key` of `<dealer-org>:<recon-case>:<inspection-phase>`.
5. Store the returned `inspectionId` and `appUrl`; show Perfect PPI lifecycle
   status from a dedicated integration record, not the Recon phase status field.
6. Verify webhook signatures over the **raw** body, reject stale timestamps, and
   deduplicate on `eventId`. Never trust an organization id from the payload as
   authorization — resolve it from the stored connection.
7. On `inspection.deliverables_ready`, fetch the manifest, download all four
   artifacts, verify each SHA-256 and content type, copy them into DealerSpace's
   own R2, and create canonical external-artifact records.
8. Complete the Recon Inspection phase **only** after every required artifact is
   persisted and verified. On failure, keep the phase open and expose
   *Retry import* / *Resync*.
9. For dealerships with an active connection, replace the internal PPI
   questionnaire with the integration card. Dealerships without a connection
   keep the internal questionnaire unchanged.

### Things to know before you start

- `POST /inspections` returns `409 user_link_required` until the sending staff
  member has linked their Perfect PPI account. Surface that as a prompt to link,
  not as an error.
- Revoking the connection in Perfect PPI immediately invalidates the token,
  revokes every user link it authorized, and fails pending deliveries. Handle
  `401 connection_revoked` by prompting for reconnection.
- Rotating credentials has **no overlap window**. The old token stops working
  the moment the new one is issued.
- `deliverablesReady` on the status endpoint is the cheap way to decide whether
  fetching the manifest is worthwhile.
- A resubmission produces a new submission and a new output version. Treat a
  higher manifest `version` as a new immutable artifact set rather than an
  update to the one already imported.
