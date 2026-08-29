import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { isManagedUploadUrl } from "../../src/features/uploads/url.ts";

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
});
