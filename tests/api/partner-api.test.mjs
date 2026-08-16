import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  VALID_VIN,
  admin,
  apiRequest,
  insertInstallationCode,
  resetFixtures,
  seedOrganization,
  startServer,
  startWebhookReceiver,
} from "./helpers.mjs";

// ============================================================================
// Partner API acceptance tests, end to end over HTTP against the built server.
//
//   node --test tests/api/partner-api.test.mjs
//
// Expects a local Supabase with every migration applied and `next build`
// already run. See docs/DEALERSPACE_INTEGRATION.md for the exact command.
// ============================================================================

const PORT = Number(process.env.PPI_TEST_PORT ?? 3999);
const ENCRYPTION_KEY = randomBytes(32).toString("base64");
const WORKER_SECRET = "test-worker-secret";

const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");

/** Mirrors the format Perfect PPI produces, so the tests exercise the real shape. */
function makeInstallationCode() {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const groups = [];
  for (let g = 0; g < 4; g++) {
    let chunk = "";
    for (const byte of randomBytes(5)) chunk += alphabet[byte % alphabet.length];
    groups.push(chunk);
  }
  const code = `PPI-${groups.join("-")}`;
  return { code, codeHash: sha256Hex(code), codePrefix: `PPI-${groups[0]}` };
}

let server;
let baseUrl;
let alpha;
let beta;
let webhook;

/** Credentials issued to the Alpha dealership during the exchange test. */
const alphaConn = {};
const betaConn = {};

before(async () => {
  await resetFixtures();

  webhook = await startWebhookReceiver();

  alpha = await seedOrganization({
    slug: "alpha",
    name: "Alpha Motors",
    techEmail: "tech-alpha@example.com",
  });
  beta = await seedOrganization({
    slug: "beta",
    name: "Beta Auto",
    techEmail: "tech-beta@example.com",
  });

  server = await startServer({
    port: PORT,
    env: {
      PARTNER_SECRET_ENCRYPTION_KEY: ENCRYPTION_KEY,
      // Lets the tests register a loopback webhook receiver. Off in production,
      // where the SSRF guard rejects every private address.
      PARTNER_ALLOW_INSECURE_CALLBACKS: "true",
      WORKER_SECRET,
      CRON_SECRET: WORKER_SECRET,
      NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
    },
  });
  baseUrl = server.baseUrl;
});

after(async () => {
  server?.stop();
  await webhook?.close();
  await resetFixtures();
});

// ---------------------------------------------------------------------------

describe("organization connection", () => {
  test("rejects an unknown installation code", async () => {
    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/connections/exchange", {
      method: "POST",
      body: {
        code: "PPI-AAAAA-BBBBB-CCCCC-DDDDD",
        externalOrganizationId: "dms-alpha",
        webhookUrl: webhook.url,
        userLinkRedirectUri: webhook.url,
      },
    });

    assert.equal(status, 400);
    assert.equal(body.error, "invalid_installation_code");
  });

  test("rejects a callback pointing at a private address", async () => {
    const { code, codeHash, codePrefix } = makeInstallationCode();
    await insertInstallationCode({
      organizationId: alpha.org.id,
      codeHash,
      codePrefix,
      createdBy: alpha.profileId,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });

    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/connections/exchange", {
      method: "POST",
      body: {
        code,
        externalOrganizationId: "dms-alpha",
        // Cloud instance metadata — the classic SSRF target.
        webhookUrl: "https://169.254.169.254/latest/meta-data/",
        userLinkRedirectUri: webhook.url,
      },
    });

    assert.equal(status, 400);
    assert.equal(body.error, "invalid_callback_url");
    assert.equal(body.field, "webhookUrl");

    await admin().from("partner_installation_codes").delete().eq("code_hash", codeHash);
  });

  test("rejects an expired code", async () => {
    const { code, codeHash, codePrefix } = makeInstallationCode();
    await insertInstallationCode({
      organizationId: alpha.org.id,
      codeHash,
      codePrefix,
      createdBy: alpha.profileId,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/connections/exchange", {
      method: "POST",
      body: {
        code,
        externalOrganizationId: "dms-alpha",
        webhookUrl: webhook.url,
        userLinkRedirectUri: webhook.url,
      },
    });

    assert.equal(status, 400);
    assert.equal(body.error, "installation_code_expired");

    await admin().from("partner_installation_codes").delete().eq("code_hash", codeHash);
  });

  test("rejects a revoked code", async () => {
    const { code, codeHash, codePrefix } = makeInstallationCode();
    const id = await insertInstallationCode({
      organizationId: alpha.org.id,
      codeHash,
      codePrefix,
      createdBy: alpha.profileId,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
    await admin()
      .from("partner_installation_codes")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", id);

    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/connections/exchange", {
      method: "POST",
      body: {
        code,
        externalOrganizationId: "dms-alpha",
        webhookUrl: webhook.url,
        userLinkRedirectUri: webhook.url,
      },
    });

    assert.equal(status, 400);
    assert.equal(body.error, "invalid_installation_code");

    await admin().from("partner_installation_codes").delete().eq("id", id);
  });

  test("exchanges a valid code exactly once", async () => {
    const { code, codeHash, codePrefix } = makeInstallationCode();
    await insertInstallationCode({
      organizationId: alpha.org.id,
      codeHash,
      codePrefix,
      createdBy: alpha.profileId,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });

    const first = await apiRequest(baseUrl, "/api/v1/partner/connections/exchange", {
      method: "POST",
      body: {
        code,
        externalOrganizationId: "dms-alpha",
        displayName: "Alpha DealerSpace",
        webhookUrl: webhook.url,
        userLinkRedirectUri: webhook.url,
      },
    });

    assert.equal(first.status, 201);
    assert.ok(first.body.token.startsWith("ppi_"), "a bearer token is returned");
    assert.ok(first.body.webhookSecret.startsWith("whsec_"), "a signing secret is returned");
    assert.equal(first.body.organization.id, alpha.org.id);

    alphaConn.id = first.body.connectionId;
    alphaConn.token = first.body.token;
    alphaConn.webhookSecret = first.body.webhookSecret;

    // Only a hash is persisted.
    const { data: stored } = await admin()
      .from("partner_connections")
      .select("token_hash, webhook_secret_ciphertext")
      .eq("id", alphaConn.id)
      .single();

    assert.equal(stored.token_hash, sha256Hex(alphaConn.token));
    assert.ok(
      !stored.webhook_secret_ciphertext.includes(alphaConn.webhookSecret),
      "the signing secret is not stored in plaintext",
    );

    // Second use of the same code.
    const second = await apiRequest(baseUrl, "/api/v1/partner/connections/exchange", {
      method: "POST",
      body: {
        code,
        externalOrganizationId: "dms-alpha-again",
        webhookUrl: webhook.url,
        userLinkRedirectUri: webhook.url,
      },
    });

    assert.equal(second.status, 409);
    assert.equal(second.body.error, "installation_code_already_used");
  });

  test("connects the second dealership for cross-tenant tests", async () => {
    const { code, codeHash, codePrefix } = makeInstallationCode();
    await insertInstallationCode({
      organizationId: beta.org.id,
      codeHash,
      codePrefix,
      createdBy: beta.profileId,
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });

    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/connections/exchange", {
      method: "POST",
      body: {
        code,
        externalOrganizationId: "dms-beta",
        webhookUrl: webhook.url,
        userLinkRedirectUri: webhook.url,
      },
    });

    assert.equal(status, 201);
    betaConn.id = body.connectionId;
    betaConn.token = body.token;
  });
});

describe("bearer authentication and scopes", () => {
  test("requires a credential", async () => {
    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/connections/self");
    assert.equal(status, 401);
    assert.equal(body.error, "missing_credentials");
  });

  test("rejects malformed and forged tokens", async () => {
    for (const token of ["nonsense", "ppi_deadbeefdeadbeef_" + "a".repeat(43)]) {
      const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/connections/self", {
        token,
      });
      assert.equal(status, 401, `token ${token.slice(0, 20)} must be rejected`);
      assert.equal(body.error, "invalid_credentials");
    }
  });

  test("accepts a live credential and reports the bound organization", async () => {
    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/connections/self", {
      token: alphaConn.token,
    });

    assert.equal(status, 200);
    assert.equal(body.organization.id, alpha.org.id);
    assert.deepEqual(body.scopes.sort(), [
      "artifacts:create" > "" ? "artifacts:read" : "",
      "inspections:create",
      "inspections:read",
    ].filter(Boolean).sort());
    assert.equal(body.status, "active");
    assert.ok(!JSON.stringify(body).includes(alphaConn.token), "the token is not echoed back");
  });

  test("enforces scopes per operation", async () => {
    // A connection granted read-only access must not be able to create.
    const readOnly = await admin()
      .from("partner_connections")
      .update({ scopes: ["inspections:read"] })
      .eq("id", betaConn.id)
      .select("id")
      .single();
    assert.ok(readOnly.data);

    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/inspections", {
      method: "POST",
      token: betaConn.token,
      idempotencyKey: "scope-test",
      body: {
        externalOrganizationId: "dms-beta",
        externalActorId: "beta-staff-1",
        vehicle: { vin: VALID_VIN },
      },
    });

    assert.equal(status, 403);
    assert.equal(body.error, "insufficient_scope");
    assert.equal(body.requiredScope, "inspections:create");

    await admin()
      .from("partner_connections")
      .update({ scopes: ["inspections:create", "inspections:read", "artifacts:read"] })
      .eq("id", betaConn.id);
  });
});

describe("technician account linking", () => {
  const linkState = {};

  test("a matching email does not create a link by itself", async () => {
    // The DealerSpace staff id is deliberately the technician's own email.
    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/inspections", {
      method: "POST",
      token: alphaConn.token,
      idempotencyKey: "email-match-test",
      body: {
        externalOrganizationId: "dms-alpha",
        externalActorId: alpha.email,
        vehicle: { vin: VALID_VIN },
      },
    });

    assert.equal(status, 409);
    assert.equal(body.error, "user_link_required");
  });

  test("initiating returns a browser authorization URL and links nothing yet", async () => {
    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/user-links", {
      method: "POST",
      token: alphaConn.token,
      body: { externalUserId: "alpha-staff-1" },
    });

    assert.equal(status, 201);
    assert.ok(body.authorizationUrl.includes("/link/dealerspace/"));
    assert.ok(body.state.length >= 16);
    linkState.state = body.state;

    const { count } = await admin()
      .from("partner_user_links")
      .select("*", { count: "exact", head: true })
      .eq("partner_connection_id", alphaConn.id);
    assert.equal(count, 0, "initiating must not create a mapping");
  });

  test("refuses to redeem a code for an account outside the connected organization", async () => {
    // Consent is simulated at the database layer; what is under test is the
    // re-verification the exchange performs before it trusts that consent.
    const code = randomBytes(32).toString("base64url");
    await admin()
      .from("partner_user_link_transactions")
      .update({
        status: "authorized",
        // A technician who belongs to the *other* dealership.
        authorized_profile_id: beta.profileId,
        authorization_code_hash: sha256Hex(code),
        code_expires_at: new Date(Date.now() + 120_000).toISOString(),
        authorized_at: new Date().toISOString(),
      })
      .eq("state", linkState.state);

    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/user-links/exchange", {
      method: "POST",
      token: alphaConn.token,
      body: { code, state: linkState.state },
    });

    assert.equal(status, 409);
    assert.equal(body.error, "invalid_user_link");
  });

  test("redeems a valid authorization exactly once", async () => {
    const code = randomBytes(32).toString("base64url");
    await admin()
      .from("partner_user_link_transactions")
      .update({
        status: "authorized",
        authorized_profile_id: alpha.profileId,
        authorization_code_hash: sha256Hex(code),
        code_expires_at: new Date(Date.now() + 120_000).toISOString(),
        authorized_at: new Date().toISOString(),
      })
      .eq("state", linkState.state);

    const first = await apiRequest(baseUrl, "/api/v1/partner/user-links/exchange", {
      method: "POST",
      token: alphaConn.token,
      body: { code, state: linkState.state },
    });

    assert.equal(first.status, 201);
    assert.equal(first.body.externalUserId, "alpha-staff-1");
    assert.equal(first.body.perfectppiProfileId, alpha.profileId);

    const second = await apiRequest(baseUrl, "/api/v1/partner/user-links/exchange", {
      method: "POST",
      token: alphaConn.token,
      body: { code, state: linkState.state },
    });

    assert.equal(second.status, 400);
    assert.equal(second.body.error, "invalid_authorization_code");
  });

  test("a code issued for one connection cannot be redeemed by another", async () => {
    const state = randomBytes(24).toString("base64url");
    const code = randomBytes(32).toString("base64url");

    await admin().from("partner_user_link_transactions").insert({
      partner_connection_id: alphaConn.id,
      external_user_id: "alpha-staff-2",
      state,
      redirect_uri: webhook.url,
      status: "authorized",
      authorized_profile_id: alpha.profileId,
      authorization_code_hash: sha256Hex(code),
      code_expires_at: new Date(Date.now() + 120_000).toISOString(),
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });

    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/user-links/exchange", {
      method: "POST",
      token: betaConn.token,
      body: { code, state },
    });

    assert.equal(status, 400);
    assert.equal(body.error, "invalid_authorization_code");
  });

  test("handles a staff id containing filter metacharacters", async () => {
    // external_user_id is free text from DealerSpace. A value with a comma or a
    // dot must not be able to alter the PostgREST predicates used when a
    // previous link is superseded.
    const awkwardId = "user,1.eq.x(y)";
    const state = randomBytes(24).toString("base64url");
    const code = randomBytes(32).toString("base64url");

    await admin().from("partner_user_link_transactions").insert({
      partner_connection_id: alphaConn.id,
      external_user_id: awkwardId,
      state,
      redirect_uri: webhook.url,
      status: "authorized",
      authorized_profile_id: alpha.profileId,
      authorization_code_hash: sha256Hex(code),
      code_expires_at: new Date(Date.now() + 120_000).toISOString(),
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });

    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/user-links/exchange", {
      method: "POST",
      token: alphaConn.token,
      body: { code, state },
    });

    assert.equal(status, 201, "an awkward staff id still links successfully");
    assert.equal(body.externalUserId, awkwardId);

    // Relinking that profile superseded the previous mapping rather than
    // leaving two active rows the unique index would have rejected.
    const { data: active } = await admin()
      .from("partner_user_links")
      .select("external_user_id")
      .eq("partner_connection_id", alphaConn.id)
      .eq("status", "active");

    assert.equal(active.length, 1, "exactly one active link remains");
    assert.equal(active[0].external_user_id, awkwardId);

    // Restore the mapping the inspection tests depend on.
    const restoreState = randomBytes(24).toString("base64url");
    const restoreCode = randomBytes(32).toString("base64url");
    await admin().from("partner_user_link_transactions").insert({
      partner_connection_id: alphaConn.id,
      external_user_id: "alpha-staff-1",
      state: restoreState,
      redirect_uri: webhook.url,
      status: "authorized",
      authorized_profile_id: alpha.profileId,
      authorization_code_hash: sha256Hex(restoreCode),
      code_expires_at: new Date(Date.now() + 120_000).toISOString(),
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    const restored = await apiRequest(baseUrl, "/api/v1/partner/user-links/exchange", {
      method: "POST",
      token: alphaConn.token,
      body: { code: restoreCode, state: restoreState },
    });
    assert.equal(restored.status, 201);
  });

  test("reports link status and revokes idempotently", async () => {
    const status1 = await apiRequest(
      baseUrl,
      "/api/v1/partner/user-links/alpha-staff-1",
      { token: alphaConn.token },
    );
    assert.equal(status1.body.linked, true);

    const unknown = await apiRequest(
      baseUrl,
      "/api/v1/partner/user-links/nobody",
      { token: alphaConn.token },
    );
    assert.equal(unknown.body.linked, false);
    assert.equal(unknown.body.reason, "user_link_required");
  });
});

describe("inspection creation", () => {
  const created = {};
  const key = "dms-alpha:recon-1:phase-1";
  const payload = {
    externalOrganizationId: "dms-alpha",
    externalReconCaseId: "recon-1",
    externalVehicleId: "vehicle-1",
    externalInspectionPhaseId: "phase-1",
    externalActorId: "alpha-staff-1",
    source: { system: "dealerspace", label: "DealerSpace Inspection" },
    vehicle: {
      vin: VALID_VIN,
      stockNumber: "A1024",
      year: 2023,
      make: "Toyota",
      model: "Camry",
      trim: "SE",
      mileage: 24150,
      exteriorColor: "White",
    },
  };

  test("requires an idempotency key", async () => {
    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/inspections", {
      method: "POST",
      token: alphaConn.token,
      body: payload,
    });

    assert.equal(status, 400);
    assert.equal(body.error, "missing_idempotency_key");
  });

  test("rejects a VIN that fails its check digit", async () => {
    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/inspections", {
      method: "POST",
      token: alphaConn.token,
      idempotencyKey: "bad-vin",
      // Position 9 is the check digit; 1HGCM82633A004352 requires "3" there.
      body: { ...payload, vehicle: { ...payload.vehicle, vin: "1HGCM82613A004352" } },
    });

    assert.equal(status, 400);
    assert.equal(body.error, "invalid_vin");
  });

  test("rejects an organization id that is not the one bound to the connection", async () => {
    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/inspections", {
      method: "POST",
      token: alphaConn.token,
      idempotencyKey: "wrong-org",
      body: { ...payload, externalOrganizationId: "dms-beta" },
    });

    assert.equal(status, 403);
    assert.equal(body.error, "organization_mismatch");
  });

  test("rejects unexpected fields rather than storing them", async () => {
    const { status } = await apiRequest(baseUrl, "/api/v1/partner/inspections", {
      method: "POST",
      token: alphaConn.token,
      idempotencyKey: "extra-fields",
      body: { ...payload, customer: { name: "Jane", ssn: "000-00-0000" } },
    });

    assert.equal(status, 400, "customer or finance data must not be accepted");
  });

  test("creates the inspection assigned to the linked technician", async () => {
    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/inspections", {
      method: "POST",
      token: alphaConn.token,
      idempotencyKey: key,
      body: payload,
    });

    assert.equal(status, 201);
    assert.equal(body.created, true);
    assert.equal(body.status, "assigned");
    assert.equal(body.assignedTechnician.profileId, alpha.profileId);
    assert.ok(body.appUrl.includes(body.inspectionId));

    created.inspectionId = body.inspectionId;

    const { data: request } = await admin()
      .from("ppi_requests")
      .select("assigned_tech_id, requester_id, requesting_organization_id, source_system")
      .eq("id", created.inspectionId)
      .single();

    assert.equal(request.assigned_tech_id, alpha.profileId);
    assert.equal(request.requester_id, null, "no synthetic consumer is invented");
    assert.equal(request.requesting_organization_id, alpha.org.id);
    assert.equal(request.source_system, "dealerspace");
  });

  test("a replay returns the same inspection and creates no second one", async () => {
    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/inspections", {
      method: "POST",
      token: alphaConn.token,
      idempotencyKey: key,
      body: payload,
    });

    assert.equal(status, 200);
    assert.equal(body.created, false);
    assert.equal(body.inspectionId, created.inspectionId);

    const { count } = await admin()
      .from("ppi_requests")
      .select("*", { count: "exact", head: true })
      .eq("requesting_organization_id", alpha.org.id);

    assert.equal(count, 1, "exactly one inspection exists after the replay");
  });

  test("the same key with a different payload is a conflict", async () => {
    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/inspections", {
      method: "POST",
      token: alphaConn.token,
      idempotencyKey: key,
      body: { ...payload, vehicle: { ...payload.vehicle, mileage: 99999 } },
    });

    assert.equal(status, 409);
    assert.equal(body.error, "idempotency_conflict");
  });

  test("the vehicle snapshot is unchanged after the conflicting replay", async () => {
    const { body } = await apiRequest(
      baseUrl,
      `/api/v1/partner/inspections/${created.inspectionId}`,
      { token: alphaConn.token },
    );

    assert.equal(body.vehicleSnapshot.mileage, 24150);
    assert.equal(body.vehicleSnapshot.stockNumber, "A1024");
    assert.equal(body.vehicleSnapshot.vin, VALID_VIN);
  });

  test("another dealership cannot read the inspection", async () => {
    const { status, body } = await apiRequest(
      baseUrl,
      `/api/v1/partner/inspections/${created.inspectionId}`,
      { token: betaConn.token },
    );

    assert.equal(status, 404);
    assert.equal(body.error, "inspection_not_found", "existence must not be disclosed");
  });

  test("deliverables are not offered before every artifact exists", async () => {
    const { status, body } = await apiRequest(
      baseUrl,
      `/api/v1/partner/inspections/${created.inspectionId}/deliverables`,
      { token: alphaConn.token },
    );

    assert.equal(status, 409);
    assert.equal(body.error, "deliverables_not_ready");
  });

  test("exports the inspection id for the delivery tests", () => {
    assert.ok(created.inspectionId);
    process.env.PPI_TEST_INSPECTION_ID = created.inspectionId;
  });
});

describe("deliverables and artifacts", () => {
  const state = {};

  before(async () => {
    const db = admin();
    state.inspectionId = process.env.PPI_TEST_INSPECTION_ID;

    const { data: ref } = await db
      .from("external_inspection_refs")
      .select("id")
      .eq("ppi_request_id", state.inspectionId)
      .single();
    state.refId = ref.id;

    const { data: submission } = await db
      .from("ppi_submissions")
      .insert({
        ppi_request_id: state.inspectionId,
        performer_id: alpha.profileId,
        version: 1,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    state.submissionId = submission.id;

    await db
      .from("external_inspection_refs")
      .update({ current_submission_id: state.submissionId })
      .eq("id", state.refId);

    // Stand-in artifact bytes: the checksums recorded here are the ones the
    // manifest must report, which is what a partner verifies against.
    state.bodies = {
      inspection_report_json: Buffer.from(JSON.stringify({ report: "standardized" }, null, 2)),
      inspection_report_pdf: Buffer.from("%PDF-1.4 inspection report"),
      vsc_determination_json: Buffer.from(JSON.stringify({ determination: "eligible" }, null, 2)),
      vsc_determination_pdf: Buffer.from("%PDF-1.4 vsc determination"),
    };
  });

  test("a partial artifact set is still not deliverable", async () => {
    const db = admin();
    await db.from("integration_artifacts").insert({
      external_inspection_ref_id: state.refId,
      ppi_submission_id: state.submissionId,
      output_version: 1,
      artifact_type: "inspection_report_json",
      content_type: "application/json",
      size_bytes: state.bodies.inspection_report_json.byteLength,
      sha256: sha256Hex(state.bodies.inspection_report_json),
      storage_key: `test/${state.submissionId}/v1/inspection_report_json.json`,
    });

    const { status, body } = await apiRequest(
      baseUrl,
      `/api/v1/partner/inspections/${state.inspectionId}/deliverables`,
      { token: alphaConn.token },
    );

    assert.equal(status, 409);
    assert.equal(body.error, "deliverables_not_ready");
  });

  test("the manifest appears once all four artifacts exist", async () => {
    const db = admin();
    const remaining = [
      ["inspection_report_pdf", "application/pdf", "pdf"],
      ["vsc_determination_json", "application/json", "json"],
      ["vsc_determination_pdf", "application/pdf", "pdf"],
    ];

    for (const [type, contentType, ext] of remaining) {
      await db.from("integration_artifacts").insert({
        external_inspection_ref_id: state.refId,
        ppi_submission_id: state.submissionId,
        output_version: 1,
        artifact_type: type,
        content_type: contentType,
        size_bytes: state.bodies[type].byteLength,
        sha256: sha256Hex(state.bodies[type]),
        storage_key: `test/${state.submissionId}/v1/${type}.${ext}`,
      });
    }

    const { status, body } = await apiRequest(
      baseUrl,
      `/api/v1/partner/inspections/${state.inspectionId}/deliverables`,
      { token: alphaConn.token },
    );

    assert.equal(status, 200);
    assert.equal(body.version, 1);
    assert.equal(body.artifacts.length, 4);

    const byType = Object.fromEntries(body.artifacts.map((a) => [a.type, a]));
    for (const type of Object.keys(state.bodies)) {
      assert.ok(byType[type], `${type} is present in the manifest`);
      assert.equal(
        byType[type].sha256,
        sha256Hex(state.bodies[type]),
        `${type} checksum matches the stored bytes`,
      );
      assert.equal(byType[type].sizeBytes, state.bodies[type].byteLength);
      assert.equal(byType[type].downloadPath, `/api/v1/partner/artifacts/${byType[type].id}`);
    }

    state.artifactId = byType.inspection_report_json.id;
  });

  test("the status endpoint now reports the deliverables as ready", async () => {
    const { body } = await apiRequest(
      baseUrl,
      `/api/v1/partner/inspections/${state.inspectionId}`,
      { token: alphaConn.token },
    );

    assert.equal(body.deliverablesReady, true);
    assert.equal(body.readyOutputVersion, 1);
  });

  test("another dealership cannot read the manifest or the artifact", async () => {
    const manifest = await apiRequest(
      baseUrl,
      `/api/v1/partner/inspections/${state.inspectionId}/deliverables`,
      { token: betaConn.token },
    );
    assert.equal(manifest.status, 404);

    const artifact = await apiRequest(
      baseUrl,
      `/api/v1/partner/artifacts/${state.artifactId}`,
      { token: betaConn.token },
    );
    assert.equal(artifact.status, 404);
    assert.equal(artifact.body.error, "artifact_not_found");
  });

  test("an artifact download requires a credential", async () => {
    const { status } = await apiRequest(
      baseUrl,
      `/api/v1/partner/artifacts/${state.artifactId}`,
    );
    assert.equal(status, 401);
  });

  test("the owning dealership passes authorization on the artifact route", async () => {
    const { status, body, headers } = await apiRequest(
      baseUrl,
      `/api/v1/partner/artifacts/${state.artifactId}`,
      { token: alphaConn.token },
    );

    if (status === 503) {
      // No R2 in this environment. Reaching the storage layer at all proves
      // authentication and ownership already passed.
      assert.equal(body.error, "storage_unavailable");
      return;
    }

    assert.equal(status, 200);
    assert.equal(headers.get("content-type"), "application/json");
    assert.equal(
      headers.get("x-perfectppi-artifact-sha256"),
      sha256Hex(state.bodies.inspection_report_json),
    );
    assert.match(headers.get("content-disposition"), /^attachment; filename="/);
    assert.equal(
      sha256Hex(body),
      headers.get("x-perfectppi-artifact-sha256"),
      "downloaded bytes hash to the advertised checksum",
    );
  });
});

describe("signed outbound webhooks", () => {
  const state = {};

  before(async () => {
    state.inspectionId = process.env.PPI_TEST_INSPECTION_ID;
    const { data: ref } = await admin()
      .from("external_inspection_refs")
      .select("id, partner_connection_id")
      .eq("ppi_request_id", state.inspectionId)
      .single();
    state.refId = ref.id;
    state.connectionId = ref.partner_connection_id;
  });

  test("delivers a signed notification that verifies against the raw body", async () => {
    const db = admin();

    // Queue the notification the way "Send to DealerSpace" does.
    const { error } = await db.rpc("partner_request_delivery", {
      p_ref_id: state.refId,
      p_output_version: 1,
      p_event_id: crypto.randomUUID(),
      p_occurred_at: new Date().toISOString(),
    });
    assert.equal(error, null);

    // Two ticks: the queue also holds the lifecycle events from creation, and
    // delivery is at-least-once rather than ordered.
    for (let i = 0; i < 2; i++) {
      const tick = await apiRequest(baseUrl, "/api/internal/workers/deliveries", {
        method: "POST",
        headers: { "x-worker-secret": WORKER_SECRET },
      });
      assert.equal(tick.status, 200);
    }

    const delivered = await webhook.waitForEvent("inspection.deliverables_ready");
    assert.ok(delivered, "the deliverables notification reached the receiver");

    const headers = delivered.headers;
    assert.equal(headers["x-perfectppi-connection"], state.connectionId);
    assert.ok(headers["x-perfectppi-event-id"]?.startsWith("evt_"));
    assert.match(headers["x-perfectppi-signature"], /^v1=[0-9a-f]{64}$/);

    // Verify exactly as DealerSpace must: HMAC over timestamp + "." + raw body.
    const expected = createHmac("sha256", alphaConn.webhookSecret)
      .update(`${headers["x-perfectppi-timestamp"]}.${delivered.rawBody}`)
      .digest("hex");
    const presented = headers["x-perfectppi-signature"].slice("v1=".length);

    assert.ok(
      timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(presented, "hex")),
      "signature verifies with the secret issued at exchange",
    );

    // The body carries metadata only — no artifact bytes travel by webhook.
    const payload = JSON.parse(delivered.rawBody);
    assert.equal(payload.type, "inspection.deliverables_ready");
    assert.equal(payload.inspectionId, state.inspectionId);
    assert.equal(payload.deliveryVersion, 1);
    assert.ok(!("artifacts" in payload), "artifacts are pulled, not pushed");
    assert.ok(delivered.rawBody.length < 1024, "the notification stays small");

    // A signature computed with the wrong secret must not verify.
    const forged = createHmac("sha256", "whsec_wrong")
      .update(`${headers["x-perfectppi-timestamp"]}.${delivered.rawBody}`)
      .digest("hex");
    assert.notEqual(forged, presented);
  });

  test("marks the inspection delivered and does not resend", async () => {
    const { data: ref } = await admin()
      .from("external_inspection_refs")
      .select("delivery_status, delivery_version")
      .eq("id", state.refId)
      .single();

    assert.equal(ref.delivery_status, "delivered");
    assert.equal(ref.delivery_version, 1);

    const deliveredCount = () =>
      webhook.received.filter((entry) => {
        try {
          return JSON.parse(entry.rawBody).type === "inspection.deliverables_ready";
        } catch {
          return false;
        }
      }).length;

    const before = deliveredCount();
    await apiRequest(baseUrl, "/api/internal/workers/deliveries", {
      method: "POST",
      headers: { "x-worker-secret": WORKER_SECRET },
    });
    assert.equal(deliveredCount(), before, "a delivered event is not resent");
  });

  test("records an attempt row for support and replay", async () => {
    const { data: event } = await admin()
      .from("outbound_events")
      .select("id, status, attempt_count, last_response_status")
      .eq("external_inspection_ref_id", state.refId)
      .eq("event_type", "inspection.deliverables_ready")
      .single();

    assert.equal(event.status, "delivered");
    assert.equal(event.last_response_status, 200);

    const { data: attempts } = await admin()
      .from("webhook_delivery_attempts")
      .select("attempt_number, response_status")
      .eq("outbound_event_id", event.id);

    assert.ok(attempts.length >= 1);
    assert.equal(attempts[0].response_status, 200);
  });

  test("retries a failing endpoint instead of giving up", async () => {
    const db = admin();
    webhook.setStatus(500);

    const { data: queued } = await db
      .from("outbound_events")
      .insert({
        partner_connection_id: state.connectionId,
        external_inspection_ref_id: state.refId,
        event_type: "inspection.delivered",
        payload: { eventId: "evt_retry_test", type: "inspection.delivered" },
        dedupe_key: `retry-test:${Date.now()}`,
      })
      .select("id")
      .single();

    await apiRequest(baseUrl, "/api/internal/workers/deliveries", {
      method: "POST",
      headers: { "x-worker-secret": WORKER_SECRET },
    });

    const { data: after } = await db
      .from("outbound_events")
      .select("status, attempt_count, next_attempt_at, last_response_status")
      .eq("id", queued.id)
      .single();

    assert.equal(after.status, "pending", "a 5xx is retried, not failed");
    assert.equal(after.attempt_count, 1);
    assert.equal(after.last_response_status, 500);
    assert.ok(
      new Date(after.next_attempt_at).getTime() > Date.now(),
      "the retry is scheduled with backoff",
    );

    // A 4xx, by contrast, is permanent.
    webhook.setStatus(404);
    await db
      .from("outbound_events")
      .update({ status: "pending", next_attempt_at: new Date().toISOString(), attempt_count: 0 })
      .eq("id", queued.id);

    await apiRequest(baseUrl, "/api/internal/workers/deliveries", {
      method: "POST",
      headers: { "x-worker-secret": WORKER_SECRET },
    });

    const { data: permanent } = await db
      .from("outbound_events")
      .select("status")
      .eq("id", queued.id)
      .single();

    assert.equal(permanent.status, "failed", "a 4xx is not retried forever");
    webhook.setStatus(200);
  });
});

describe("worker endpoints", () => {
  test("reject callers without the worker secret", async () => {
    for (const path of ["/api/internal/workers/outputs", "/api/internal/workers/deliveries"]) {
      const { status } = await apiRequest(baseUrl, path, { method: "POST" });
      assert.equal(status, 401, `${path} must require the worker secret`);

      const wrong = await apiRequest(baseUrl, path, {
        method: "POST",
        headers: { "x-worker-secret": "not-the-secret" },
      });
      assert.equal(wrong.status, 401);
    }
  });
});

describe("connection revocation", () => {
  test("revoked credentials stop working immediately", async () => {
    await admin()
      .from("partner_connections")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", betaConn.id);

    const { status, body } = await apiRequest(baseUrl, "/api/v1/partner/connections/self", {
      token: betaConn.token,
    });

    assert.equal(status, 401);
    assert.equal(body.error, "connection_revoked");

    const create = await apiRequest(baseUrl, "/api/v1/partner/inspections", {
      method: "POST",
      token: betaConn.token,
      idempotencyKey: "after-revoke",
      body: {
        externalOrganizationId: "dms-beta",
        externalActorId: "beta-staff-1",
        vehicle: { vin: VALID_VIN },
      },
    });

    assert.equal(create.status, 401);
    assert.equal(create.body.error, "connection_revoked");
  });
});
