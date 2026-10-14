import { performance } from "node:perf_hooks";

// Explicit synthetic staging harness. Tokens and response bodies stay private.
if (process.argv.includes("--help")) {
  console.log("Set LOAD_TEST_ORIGIN, LOAD_TEST_TOKEN, LOAD_TEST_PATHS (comma-separated GET paths), LOAD_TEST_CONCURRENCY (1-20), LOAD_TEST_REQUESTS (1-1000), and LOAD_TEST_SYNTHETIC=true. Run with node --env-file=<staging-env> tools/measure-api-load.mts.");
  process.exit(0);
}
if (process.env.LOAD_TEST_SYNTHETIC !== "true") throw new Error("Confirm LOAD_TEST_SYNTHETIC=true for synthetic staging accounts/data");
const origin = new URL(process.env.LOAD_TEST_ORIGIN ?? "");
if (origin.username || origin.password || !["https:", "http:"].includes(origin.protocol)) throw new Error("Invalid staging origin");
if (["perfectppi.com", "www.perfectppi.com", "perfectppi.vercel.app"].includes(origin.hostname)) throw new Error("Use an isolated staging origin for load tests");
const paths = (process.env.LOAD_TEST_PATHS ?? "/api/community/posts").split(",");
if (paths.some((path) => !path.startsWith("/api/") || new URL(path, origin).origin !== origin.origin || /internal|webhooks/.test(path))) throw new Error("Use ordinary read-only API paths");
if (!process.env.LOAD_TEST_TOKEN) throw new Error("LOAD_TEST_TOKEN is required");
const requests = Number(process.env.LOAD_TEST_REQUESTS ?? 100);
const concurrency = Number(process.env.LOAD_TEST_CONCURRENCY ?? 4);
if (!Number.isInteger(requests) || requests < 1 || requests > 1000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 20) throw new Error("Invalid load bounds");
let cursor = 0;
const samples: { path: number; status: number; ms: number }[] = [];
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < requests) {
    const index = cursor++;
    const started = performance.now();
    let status = 0;
    try {
      const response = await fetch(new URL(paths[index % paths.length], origin), {
        headers: { Authorization: `Bearer ${process.env.LOAD_TEST_TOKEN}`, "X-PPI-Inspection-Catalog": "2" },
        redirect: "error", signal: AbortSignal.timeout(30_000),
      });
      status = response.status;
      // Read the full response to include transfer time without retaining it.
      const reader = response.body?.getReader();
      if (reader) { while (!(await reader.read()).done) { /* discard */ } reader.releaseLock(); }
    } catch { status = 0; }
    samples.push({ path: index % paths.length, status, ms: performance.now() - started });
  }
}));
const results = paths.map((_, path) => {
  const entries = samples.filter((entry) => entry.path === path);
  const times = entries.map((entry) => entry.ms).sort((a, b) => a - b);
  const percentile = (fraction: number) => times.length ? Math.round(times[Math.ceil(times.length * fraction) - 1]) : null;
  return { pathIndex: path, requests: entries.length, errors: entries.filter((entry) => entry.status < 200 || entry.status >= 300).length,
    p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), maxMs: times.length ? Math.round(times[times.length - 1]) : null };
});
console.log(JSON.stringify({ concurrency, results }, null, 2));
if (results.some((result) => result.errors > 0)) process.exitCode = 1;
