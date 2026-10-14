import { readFile } from "node:fs/promises";

// Read-only deployment checks. No credentials or full response bodies printed.
if (process.argv.includes("--help")) {
  console.log("Usage: node tools/check-release.mts [https://www.perfectppi.com]");
  process.exit(0);
}
const origin = new URL(process.argv[2] ?? "https://www.perfectppi.com");
if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/") throw new Error("Supply an HTTPS origin");
const checks: { check: string; ok: boolean }[] = [];
async function check(name: string, task: () => Promise<boolean>) {
  try { checks.push({ check: name, ok: await task() }); }
  catch { checks.push({ check: name, ok: false }); }
}
await check("site", async () => {
  const response = await fetch(origin, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  await response.body?.cancel();
  return response.status === 200;
});
await check("aasa", async () => {
  const response = await fetch(new URL("/.well-known/apple-app-site-association", origin), { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  if (response.status !== 200 || !response.headers.get("content-type")?.includes("json")) { await response.body?.cancel(); return false; }
  const body = await response.json();
  const appID = "79P499H2M4.com.perfectppi.app";
  return body.applinks?.details?.some((entry: { appID?: string; appIDs?: string[] }) => entry.appID === appID || entry.appIDs?.includes(appID)) === true
    && body.webcredentials?.apps?.includes(appID) === true;
});
for (const path of ["/support", "/privacy", "/terms", "/community-guidelines", "/ai-disclosure"]) {
  await check(path, async () => {
    const response = await fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    await response.body?.cancel();
    return response.status === 200;
  });
}
await check("private-worker", async () => {
  const response = await fetch(new URL("/api/internal/workers/storage-cleanup", origin), { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  await response.body?.cancel();
  return response.status === 401 || response.status === 503;
});
await check("native-domain-defaults", async () => {
  const config = await readFile(new URL("../mobile-app/PerfectPPI/Resources/AppConfig.example.plist", import.meta.url), "utf8");
  return config.includes(`<string>${origin.origin}</string>`);
});
console.log(JSON.stringify(checks, null, 2));
if (checks.some((entry) => !entry.ok)) process.exitCode = 1;
