import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { DELETION_JOURNAL_PREFIX, verifiedDeletionJournal } from "../src/lib/privacy/deletion-journal.ts";

// Run while restored application traffic is disabled. Default: inspect only.
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: node --env-file=.env.local tools/replay-deletion-journal.mts --project-ref <ref|local> [--apply|--verify]");
  process.exit(0);
}
const expectedProject = args[args.indexOf("--project-ref") + 1];
const apply = args.includes("--apply");
const verify = args.includes("--verify");
if (!args.includes("--project-ref") || !expectedProject || (apply && verify)) throw new Error("Specify --project-ref and at most one of --apply or --verify");
const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const matchesProject = expectedProject === "local"
  ? ["localhost", "127.0.0.1"].includes(origin.hostname)
  : origin.protocol === "https:" && origin.hostname === `${expectedProject}.supabase.co`;
if (!matchesProject) throw new Error("The Supabase destination does not match --project-ref");
for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PRIVATE_BUCKET_NAME"]) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}
const admin = createClient(origin.origin, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const s3 = new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! } });
let continuation: string | undefined;
let checked = 0;
let restoredAccounts = 0;
let queued = 0;
try {
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: process.env.R2_PRIVATE_BUCKET_NAME,
      Prefix: DELETION_JOURNAL_PREFIX, ContinuationToken: continuation, MaxKeys: 100 }));
    for (const object of page.Contents ?? []) {
      if (!object.Key?.endsWith(".json")) continue;
      if (!object.Size || object.Size > 16_384) throw new Error("Invalid deletion journal size");
      const response = await s3.send(new GetObjectCommand({ Bucket: process.env.R2_PRIVATE_BUCKET_NAME, Key: object.Key }));
      if (!response.Body || (response.ContentLength ?? 16_385) > 16_384) throw new Error("Invalid deletion journal response");
      const entry = verifiedDeletionJournal(JSON.parse(await response.Body.transformToString()));
      if (object.Key !== `${DELETION_JOURNAL_PREFIX}${entry.requestId}.json`) throw new Error("Deletion journal key mismatch");
      const { data, error } = await admin.auth.admin.getUserById(entry.authUserId);
      if (error && !/user.*not found|not_found/i.test(error.message)) throw new Error("Could not inspect restored accounts");
      checked++;
      if (!data.user) continue;
      restoredAccounts++;
      if (apply) {
        const result = await admin.rpc("requeue_restored_account_deletion", {
          p_request_id: entry.requestId, p_profile_id: entry.profileId,
          p_auth_user_id: entry.authUserId, p_requested_at: entry.requestedAt,
        });
        if (result.error || !result.data) throw new Error("Could not queue a restored deletion");
        queued++;
      }
    }
    continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuation);
  console.log(JSON.stringify({ checked, restoredAccounts, queued, mode: apply ? "queued_for_worker" : verify ? "verification" : "dry_run" }));
  if (verify && restoredAccounts > 0) process.exitCode = 1;
} catch {
  // Provider errors can contain identifiers or credentials; keep CLI output bounded.
  console.error("Deletion journal replay failed. Keep restored traffic disabled and inspect restricted provider diagnostics.");
  process.exitCode = 1;
} finally {
  s3.destroy();
}
