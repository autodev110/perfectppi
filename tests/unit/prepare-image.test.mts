import assert from "node:assert/strict";
import { describe, test } from "node:test";

const { shouldPrepareImage, prepareImageForUpload, uploadFailureMessage } = await import("../../src/lib/uploads/prepare-image.ts");

describe("device-side photo preparation", () => {
  test("large or HEIC photos are re-encoded; small JPEGs pass through", () => {
    const small = new File([new Uint8Array(200_000)], "a.jpg", { type: "image/jpeg" });
    const big = new File([new Uint8Array(4_000_000)], "b.jpg", { type: "image/jpeg" });
    const heic = new File([new Uint8Array(100)], "c.heic", { type: "image/heic" });
    const untyped = new File([new Uint8Array(100)], "d", { type: "" });
    const video = new File([new Uint8Array(9_000_000)], "e.mp4", { type: "video/mp4" });
    assert.equal(shouldPrepareImage(small), false);
    assert.equal(shouldPrepareImage(big), true);
    assert.equal(shouldPrepareImage(heic), true);
    assert.equal(shouldPrepareImage(untyped), true);
    assert.equal(shouldPrepareImage(video), false);
  });

  test("without a DOM the original file is returned untouched", async () => {
    const big = new File([new Uint8Array(4_000_000)], "b.jpg", { type: "image/jpeg" });
    assert.equal(await prepareImageForUpload(big), big);
  });

  test("failure messages explain non-JSON responses", async () => {
    assert.equal(await uploadFailureMessage(new Response("nope", { status: 400 }), "Photo upload failed."), "Photo upload failed. (HTTP 400)");
    assert.match(await uploadFailureMessage(new Response("Request Entity Too Large", { status: 413 })), /too large/);
    assert.match(await uploadFailureMessage(new Response("", { status: 502 })), /temporarily unavailable/);
    assert.equal(await uploadFailureMessage(new Response(JSON.stringify({ error: "File type not allowed" }), { status: 400 })), "File type not allowed");
  });
});

describe("upload pipeline failure semantics", () => {
  test("retry is offered only when it can help", async () => {
    const { isRetryableStatus, UploadError } = await import("../../src/lib/uploads/upload-photo.ts");
    assert.equal(isRetryableStatus(undefined), true);
    assert.equal(isRetryableStatus(500), true);
    assert.equal(isRetryableStatus(429), true);
    for (const status of [400, 403, 404, 413, 415]) assert.equal(isRetryableStatus(status), false);
    const error = new UploadError("File type not allowed", "preparing", 400, false);
    assert.equal(error.retryable, false);
    assert.equal(error.stage, "preparing");
    assert.equal(error.name, "UploadError");
  });
});
