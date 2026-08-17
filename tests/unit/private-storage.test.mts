import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";

const original = {
  endpoint: process.env.R2_ENDPOINT,
  accessKey: process.env.R2_ACCESS_KEY_ID,
  secretKey: process.env.R2_SECRET_ACCESS_KEY,
  publicBucket: process.env.R2_BUCKET_NAME,
  publicUrl: process.env.R2_PUBLIC_URL,
  privateBucket: process.env.R2_PRIVATE_BUCKET_NAME,
};

const {
  isPrivateR2Configured,
  isPrivateStorageReference,
  isR2Configured,
  isStoredObjectConfigured,
  privateStorageReference,
} = await import("../../src/lib/storage/r2.ts");

afterEach(() => {
  restore("R2_ENDPOINT", original.endpoint);
  restore("R2_ACCESS_KEY_ID", original.accessKey);
  restore("R2_SECRET_ACCESS_KEY", original.secretKey);
  restore("R2_BUCKET_NAME", original.publicBucket);
  restore("R2_PUBLIC_URL", original.publicUrl);
  restore("R2_PRIVATE_BUCKET_NAME", original.privateBucket);
});

describe("private partner artifact storage", () => {
  test("does not depend on a public bucket or public URL", () => {
    process.env.R2_ENDPOINT = "https://example.invalid";
    process.env.R2_ACCESS_KEY_ID = "access";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.R2_PRIVATE_BUCKET_NAME = "private-artifacts";
    delete process.env.R2_BUCKET_NAME;
    delete process.env.R2_PUBLIC_URL;

    assert.equal(isPrivateR2Configured(), true);
    assert.equal(isR2Configured(), false);
  });

  test("uses an opaque private reference instead of a public HTTP URL", () => {
    process.env.R2_ENDPOINT = "https://example.invalid";
    process.env.R2_ACCESS_KEY_ID = "access";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.R2_PRIVATE_BUCKET_NAME = "private-artifacts";

    const reference = privateStorageReference("/integration_artifacts/submission/report.pdf");
    assert.equal(
      reference,
      "r2-private:///integration_artifacts/submission/report.pdf",
    );
    assert.equal(isPrivateStorageReference(reference), true);
    assert.equal(isStoredObjectConfigured(reference), true);
    assert.equal(reference.startsWith("http"), false);
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
