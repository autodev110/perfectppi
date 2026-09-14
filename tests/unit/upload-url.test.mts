import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  isManagedPrivateUploadReference,
  isManagedUploadUrl,
  isOwnedPrivateUploadReference,
  isVehicleQuarantineReference,
} from "../../src/features/uploads/url.ts";

// ============================================================================
// Attaching media is a second request that carries a URL string. These tests
// keep that string pinned to the bucket we actually uploaded to, so a client
// cannot point a post, listing photo, or message attachment at a host we do
// not control.
// ============================================================================

const BASE = "https://media.perfectppi.test";

describe("managed upload URLs", () => {
  test("accepts a URL under the public bucket", () => {
    assert.equal(
      isManagedUploadUrl(`${BASE}/community_post/abc/def/123.jpg`, BASE),
      true,
    );
  });

  test("rejects a look-alike host that only shares the prefix", () => {
    assert.equal(isManagedUploadUrl(`${BASE}.evil.test/x.jpg`, BASE), false);
  });

  test("rejects an unrelated host", () => {
    assert.equal(isManagedUploadUrl("https://evil.test/x.jpg", BASE), false);
  });

  test("rejects the bare base with no object key", () => {
    assert.equal(isManagedUploadUrl(BASE, BASE), false);
    assert.equal(isManagedUploadUrl(`${BASE}/`, BASE), false);
  });

  test("rejects everything when the bucket is not configured", () => {
    assert.equal(isManagedUploadUrl(`${BASE}/ok.jpg`, ""), false);
  });

  test("accepts only owner-scoped private upload references", () => {
    const owner = "11111111-1111-4111-8111-111111111111";
    const record = "22222222-2222-4222-8222-222222222222";
    assert.equal(
      isManagedPrivateUploadReference(`r2-private:///ppi_media/${owner}/${record}/capture.jpg`),
      true,
    );
    assert.equal(
      isManagedPrivateUploadReference(`r2-private:///quarantine/community_post/${owner}/${record}/capture.jpg`),
      false,
    );
    assert.equal(isManagedPrivateUploadReference("r2-private:///../../secret"), false);
  });

  test("binds private references to the exact owner and record", () => {
    const owner = "11111111-1111-4111-8111-111111111111";
    const record = "22222222-2222-4222-8222-222222222222";
    const reference = `r2-private:///ppi_media/${owner}/${record}/capture.jpg`;
    assert.equal(isOwnedPrivateUploadReference(reference, "ppi_media", owner, record), true);
    assert.equal(isOwnedPrivateUploadReference(reference, "ppi_media", owner, "33333333-3333-4333-8333-333333333333"), false);
    assert.equal(isOwnedPrivateUploadReference(reference, "vehicle_media", owner, record), false);
  });

  test("requires unattached inspection uploads to be discarded through the protected route", async () => {
    const route = await readFile(
      new URL("../../src/app/api/ppi/submissions/[id]/media/route.ts", import.meta.url),
      "utf8",
    );
    assert.match(route, /isOwnedPrivateUploadReference/);
    assert.match(route, /This photo is already attached to the inspection/);
    assert.match(route, /unattached_inspection_media_discarded/);
  });

  test("accepts only vehicle media in the vehicle quarantine namespace", () => {
    const owner = "11111111-1111-4111-8111-111111111111";
    const record = "22222222-2222-4222-8222-222222222222";
    assert.equal(
      isVehicleQuarantineReference(
        `r2-private:///quarantine/vehicle_media/${owner}/${record}/capture.jpg`,
      ),
      true,
    );
    assert.equal(
      isVehicleQuarantineReference(
        `r2-private:///quarantine/community_post/${owner}/${record}/capture.jpg`,
      ),
      false,
    );
  });
});
