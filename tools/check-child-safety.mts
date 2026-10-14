import { readFile } from "node:fs/promises";
import { scanForKnownIllegalContent } from "../src/lib/moderation/child-safety.ts";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node --env-file=.env.local tools/check-child-safety.mts <provider-authorized-benign-fixture> <image/jpeg|image/png> <clean|match|review>. Set SCANNER_BENIGN_TEST_APPROVED=true. Never use real illegal material.");
  process.exit(0);
}
if (process.env.SCANNER_BENIGN_TEST_APPROVED !== "true") throw new Error("Confirm this is a provider-authorized benign fixture with SCANNER_BENIGN_TEST_APPROVED=true");
const [fixture, contentType, expected] = args;
if (!fixture || !["image/jpeg", "image/png"].includes(contentType) || !["clean", "match", "review"].includes(expected)) throw new Error("Invalid scanner test arguments; use --help");
try {
  const bytes = await readFile(fixture);
  if (bytes.length > 10 * 1024 * 1024) throw new Error("Fixture too large");
  const result = await scanForKnownIllegalContent(bytes, contentType);
  const verdict = result.decision === "allow" ? "clean" : result.decision === "legal_hold" ? "match" : "review";
  const configured = !result.reasonCodes.includes("specialist_scan_not_configured");
  const providerResponded = typeof result.rawResult.provider === "string";
  console.log(JSON.stringify({ configured, providerResponded, verdict, expected, passed: configured && providerResponded && verdict === expected }));
  if (!configured || !providerResponded || verdict !== expected) process.exitCode = 1;
} catch {
  console.error("Scanner acceptance check failed; no fixture data or provider payload was logged.");
  process.exitCode = 1;
}
