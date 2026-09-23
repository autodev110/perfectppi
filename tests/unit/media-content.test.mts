import { describe, test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  describeImage,
  matchesCertifiedContent,
  sha256Hex,
  shortHash,
  sniffContentType,
} from "../../src/features/ppi/media-content.ts";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((value) => (typeof value === "string" ? [...value].map((char) => char.charCodeAt(0)) : [value])));
const ftyp = (brand: string) => bytes(0, 0, 0, 0x18, "ftyp", brand, 0, 0, 0, 0);

describe("inspection media content facts", () => {
  test("SHA-256 matches the standard test vector", () => {
    assert.equal(sha256Hex(bytes("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(shortHash("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"), "ba7816bf8f01cfea…");
  });

  test("the stored bytes decide the type, not the file name or declared type", () => {
    assert.equal(sniffContentType(bytes(0xff, 0xd8, 0xff, 0xe1)), "image/jpeg");
    assert.equal(sniffContentType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
    assert.equal(sniffContentType(bytes("RIFF", 0, 0, 0, 0, "WEBP")), "image/webp");
    assert.equal(sniffContentType(ftyp("heic")), "image/heic");
    assert.equal(sniffContentType(ftyp("mif1")), "image/heif");
    assert.equal(sniffContentType(ftyp("avif")), "image/avif");
    assert.equal(sniffContentType(ftyp("qt  ")), "video/quicktime");
    assert.equal(sniffContentType(ftyp("isom")), "video/mp4");
    assert.equal(sniffContentType(bytes("%PDF-1.7")), null);
    assert.equal(sniffContentType(bytes(0xff)), null);
  });

  test("export bytes are checked against the certified hash and size", () => {
    const certified = bytes("certified photo bytes");
    const entry = { sha256: sha256Hex(certified), byte_size: certified.byteLength };
    assert.equal(matchesCertifiedContent(certified, entry), "match");
    assert.equal(matchesCertifiedContent(bytes("certified photo byteZ"), entry), "mismatch");
    assert.equal(matchesCertifiedContent(bytes("certified photo bytes!"), entry), "mismatch");
    assert.equal(matchesCertifiedContent(bytes("same size, other bytes"), { sha256: entry.sha256, byte_size: null }), "mismatch");
    // Manifests certified before content hashes existed cannot be checked.
    assert.equal(matchesCertifiedContent(certified, {}), "unverifiable");
    assert.equal(matchesCertifiedContent(certified, { sha256: null }), "unverifiable");
  });

  test("image dimensions and EXIF orientation are read from the stored bytes", async () => {
    const jpeg = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#808080" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    assert.equal(sniffContentType(new Uint8Array(jpeg)), "image/jpeg");
    assert.deepEqual(await describeImage(new Uint8Array(jpeg)), { width: 64, height: 32, orientation: 6 });

    const png = await sharp({ create: { width: 10, height: 20, channels: 4, background: "#ffffff" } }).png().toBuffer();
    assert.deepEqual(await describeImage(new Uint8Array(png)), { width: 10, height: 20, orientation: null });

    // Unreadable content still gets a hash upstream; it just has no dimensions.
    assert.deepEqual(await describeImage(bytes("not an image")), { width: null, height: null, orientation: null });
  });
});
