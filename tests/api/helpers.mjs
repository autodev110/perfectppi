import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";

// ============================================================================
// Harness for the partner API acceptance tests.
//
// Boots the built Next server against a database that has every migration
// applied, seeds two unrelated dealerships, and provides a throwaway HTTP
// endpoint that stands in for DealerSpace's webhook receiver.
//
// Requires a local Supabase (or a disposable branch database) — never point
// this at production: it writes and deletes rows.
// ============================================================================

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  workerSecret: process.env.WORKER_SECRET ?? process.env.CRON_SECRET,
};

export function admin() {
  if (!env.supabaseUrl || !env.serviceKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the API tests.",
    );
  }
  return createClient(env.supabaseUrl, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// --- Server lifecycle --------------------------------------------------------

export async function startServer({ port, env: extraEnv = {} }) {
  const child = spawn("npx", ["next", "start", "-p", String(port)], {
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next start exited early:\n${logs.join("")}`);
    }
    try {
      // Any response at all means the server is listening.
      await fetch(`${baseUrl}/api/v1/partner/connections/self`, {
        signal: AbortSignal.timeout(2000),
      });
      return { baseUrl, stop: () => stopServer(child), logs };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  stopServer(child);
  throw new Error(`Server did not start within 60s:\n${logs.join("")}`);
}

function stopServer(child) {
  if (child.exitCode === null) child.kill("SIGTERM");
}

// --- Webhook receiver --------------------------------------------------------

/**
 * A stand-in for the DealerSpace webhook endpoint. Captures the *raw* body, so
 * signature verification is tested the way the real receiver has to do it.
 */
export async function startWebhookReceiver({ status = 200 } = {}) {
  const received = [];
  let responseStatus = status;

  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      received.push({
        headers: req.headers,
        rawBody: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(responseStatus, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: responseStatus < 400 }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    url: `http://localhost:${port}/webhooks/perfectppi`,
    received,
    setStatus(next) {
      responseStatus = next;
    },
    async waitForDelivery(timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (received.length > 0) return received[received.length - 1];
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return null;
    },
    /**
     * Delivery is at-least-once and a tick drains several queued events, so a
     * test that cares about one event type must look for it rather than assume
     * it arrived last.
     */
    async waitForEvent(type, timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const match = received.find((entry) => {
          try {
            return JSON.parse(entry.rawBody).type === type;
          } catch {
            return false;
          }
        });
        if (match) return match;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return null;
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// --- Request helpers ---------------------------------------------------------

export async function apiRequest(baseUrl, path, options = {}) {
  const { token, idempotencyKey, method = "GET", body, ...rest } = options;

  const headers = { ...(rest.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : Buffer.from(await response.arrayBuffer());

  return { status: response.status, body: payload, headers: response.headers };
}

// --- Fixtures ----------------------------------------------------------------

const TEST_PREFIX = "ppi-apitest";

export async function resetFixtures() {
  const db = admin();

  // Users cascade to profiles, technician_profiles, vehicles, requests, refs.
  const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const user of users?.users ?? []) {
    if (user.email?.startsWith(TEST_PREFIX)) {
      await db.auth.admin.deleteUser(user.id);
    }
  }

  const { data: orgs } = await db
    .from("organizations")
    .select("id")
    .like("slug", `${TEST_PREFIX}%`);

  for (const org of orgs ?? []) {
    await db.from("partner_connections").delete().eq("organization_id", org.id);
    await db.from("partner_installation_codes").delete().eq("organization_id", org.id);
    await db.from("vehicles").delete().eq("organization_id", org.id);
    await db.from("organizations").delete().eq("id", org.id);
  }
}

export async function seedOrganization({ slug, name, techEmail, certification = "ase" }) {
  const db = admin();

  const { data: org, error: orgError } = await db
    .from("organizations")
    .insert({ name, slug: `${TEST_PREFIX}-${slug}` })
    .select("id, name, slug")
    .single();
  if (orgError) throw new Error(`seed org failed: ${orgError.message}`);

  const email = `${TEST_PREFIX}-${techEmail}`;
  const { data: created, error: userError } = await db.auth.admin.createUser({
    email,
    password: "test-password-not-used",
    email_confirm: true,
  });
  if (userError) throw new Error(`seed user failed: ${userError.message}`);

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .update({ role: "technician", display_name: email })
    .eq("auth_user_id", created.user.id)
    .select("id")
    .single();
  if (profileError) throw new Error(`seed profile failed: ${profileError.message}`);

  const { error: techError } = await db.from("technician_profiles").insert({
    profile_id: profile.id,
    organization_id: org.id,
    certification_level: certification,
  });
  if (techError) throw new Error(`seed technician failed: ${techError.message}`);

  return { org, profileId: profile.id, authUserId: created.user.id, email };
}

export async function insertInstallationCode({ organizationId, codeHash, codePrefix, expiresAt, createdBy }) {
  const db = admin();
  const { data, error } = await db
    .from("partner_installation_codes")
    .insert({
      organization_id: organizationId,
      code_hash: codeHash,
      code_prefix: codePrefix,
      scopes: ["inspections:create", "inspections:read", "artifacts:read"],
      created_by: createdBy,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) throw new Error(`seed installation code failed: ${error.message}`);
  return data.id;
}

export const VALID_VIN = "1HGCM82633A004352";
export const OTHER_VALID_VIN = "JH4KA7561PC008269";
