import assert from "node:assert/strict";
import { describe, test } from "node:test";

const sharp = (await import("sharp")).default;
const {
  buildApprovedCommunityKey,
  communityMediaDeliveryPath,
  displayVariantIsMetadataFree,
  isApprovedCommunityReference,
  isLegacyPublicCommunityUrl,
  renderDisplayVariant,
  DISPLAY_VARIANT,
} = await import("../../src/lib/storage/community-media.ts");

const MEDIA_ID = "55300000-0000-0000-0000-000000000001";
const SHA = "a".repeat(64);

describe("community media: references", () => {
  test("clients receive a delivery path, never an object URL", () => {
    assert.equal(communityMediaDeliveryPath(MEDIA_ID), `/api/community/media/${MEDIA_ID}/display`);
  });

  test("approved keys are immutable, hash-bound, and private", () => {
    const original = buildApprovedCommunityKey({
      ownerId: "owner", postId: "post", mediaId: MEDIA_ID, sha256: SHA, contentType: "image/jpeg",
    });
    const display = buildApprovedCommunityKey({
      ownerId: "owner", postId: "post", mediaId: MEDIA_ID, sha256: SHA, contentType: "image/jpeg", variant: "display",
    });
    assert.equal(original, `community_post/owner/post/${MEDIA_ID}-${SHA.slice(0, 16)}.jpg`);
    assert.equal(display, `community_post/owner/post/${MEDIA_ID}-${SHA.slice(0, 16)}-display.webp`);
    assert.ok(isApprovedCommunityReference(`r2-private:///${original}`));
    assert.ok(!isApprovedCommunityReference("r2-private:///quarantine/community_post/x"));
    assert.ok(isLegacyPublicCommunityUrl("https://pub.example/community_post/a/b/c.jpg"));
    assert.ok(!isLegacyPublicCommunityUrl("r2-private:///community_post/a/b/c.jpg"));
  });
});

describe("community media: display variant", () => {
  async function photoWithMetadata(width: number, height: number) {
    // A landscape source stored with EXIF orientation 6 (rotate 90° CW) and
    // GPS-style tags, the shape of a phone photo with location baked in.
    return sharp({
      create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .jpeg()
      .withMetadata({
        orientation: 6,
        exif: {
          IFD0: { Make: "TestPhone", Model: "T1", Software: "unit-test", ImageDescription: "lat 40.7 lon -74.0" },
        },
      })
      .toBuffer();
  }

  test("strips EXIF and location metadata and re-encodes as webp", async () => {
    const source = await photoWithMetadata(640, 480);
    const sourceMeta = await sharp(source).metadata();
    assert.ok(sourceMeta.exif, "fixture must carry EXIF to be meaningful");
    assert.equal(sourceMeta.orientation, 6);

    const variant = await renderDisplayVariant(new Uint8Array(source));
    assert.equal(variant.contentType, "image/webp");
    const meta = await sharp(variant.bytes).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.exif, undefined);
    assert.equal(meta.orientation, undefined);
    assert.ok(await displayVariantIsMetadataFree(variant.bytes));
    // Orientation 6 was applied, so the 640x480 source is now upright 480x640.
    assert.equal(variant.width, 480);
    assert.equal(variant.height, 640);
  });

  test("bounds the longest edge without enlarging small images", async () => {
    const large = await sharp({ create: { width: 5000, height: 2500, channels: 3, background: "#123456" } }).png().toBuffer();
    const bounded = await renderDisplayVariant(new Uint8Array(large));
    assert.equal(bounded.width, DISPLAY_VARIANT.maxEdge);
    assert.equal(bounded.height, DISPLAY_VARIANT.maxEdge / 2);

    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#654321" } }).png().toBuffer();
    const kept = await renderDisplayVariant(new Uint8Array(small));
    assert.equal(kept.width, 300);
    assert.equal(kept.height, 200);
  });

  test("refuses bytes that are not a decodable image", async () => {
    await assert.rejects(() => renderDisplayVariant(new TextEncoder().encode("GIF89a not really")));
    await assert.rejects(() => renderDisplayVariant(new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01])));
  });
});
