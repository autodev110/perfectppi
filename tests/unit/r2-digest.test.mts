import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// digestStoredObject against a minimal in-process S3 endpoint: the AWS SDK
// performs a real GetObject over HTTP and the body arrives in many chunks.

const objects = new Map<string, Buffer>();
let server: Server;
let digestStoredObject: typeof import("../../src/lib/storage/r2.ts").digestStoredObject;
let uploadImmutablePrivateObject: typeof import("../../src/lib/storage/r2.ts").uploadImmutablePrivateObject;
let getStoredObjectRange: typeof import("../../src/lib/storage/r2.ts").getStoredObjectRange;

before(async () => {
  server = createServer((request, response) => {
    const key = decodeURIComponent((request.url ?? "").split("?")[0]).replace(/^\/test-bucket\//, "");
    if (request.method === "PUT") {
      if (request.headers["if-none-match"] !== "*" || objects.has(key)) {
        request.resume();
        response.writeHead(412, { "Content-Type": "application/xml" });
        response.end("<Error><Code>PreconditionFailed</Code></Error>");
        return;
      }
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        objects.set(key, Buffer.concat(chunks));
        response.writeHead(200, { ETag: '"fixture"' });
        response.end();
      });
      return;
    }
    const body = objects.get(key);
    if (!body) {
      response.writeHead(404, { "Content-Type": "application/xml" });
      response.end("<Error><Code>NoSuchKey</Code><Message>missing</Message></Error>");
      return;
    }
    response.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": String(body.length) });
    // Uneven chunks, so hashing and the kept-bytes buffer cross boundaries.
    let offset = 0;
    const size = 7_001;
    const write = () => {
      while (offset < body.length) {
        const chunk = body.subarray(offset, offset + size);
        offset += chunk.length;
        if (!response.write(chunk)) return response.once("drain", write);
      }
      response.end();
    };
    write();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const { port } = server.address() as AddressInfo;
  process.env.R2_ENDPOINT = `http://127.0.0.1:${port}`;
  process.env.R2_ACCESS_KEY_ID = "test";
  process.env.R2_SECRET_ACCESS_KEY = "test";
  process.env.R2_PRIVATE_BUCKET_NAME = "test-bucket";
  ({ digestStoredObject, uploadImmutablePrivateObject, getStoredObjectRange } = await import("../../src/lib/storage/r2.ts"));
});

after(async () => {
  if (!server?.listening) return;
  const closed = new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  // The AWS client keeps its HTTP socket alive. Explicitly close it so the
  // test worker cannot linger after every assertion has completed.
  server.closeAllConnections();
  await closed;
});

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describe("streaming content digest", () => {
  test("private deletion journals are create-only and remain readable on retry", async () => {
    const key = "privacy_deletion_journal/fixture.json";
    const body = Buffer.from('{"fixture":true}');
    await uploadImmutablePrivateObject({ key, body, contentType: "application/json" });
    await assert.rejects(
      uploadImmutablePrivateObject({ key, body: Buffer.from("changed"), contentType: "application/json" }),
      (error: unknown) => error instanceof Error && error.name === "PreconditionFailed",
    );
    const stored = await getStoredObjectRange(`r2-private:///${key}`, null, { maxBytes: 16_384 });
    assert.deepEqual(Buffer.from(stored.bytes), body);
  });

  test("hashes and keeps a photo-sized object", async () => {
    const photo = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(150_000, 7)]);
    objects.set("ppi_media/owner/sub/photo.jpg", photo);
    const digest = await digestStoredObject("r2-private:///ppi_media/owner/sub/photo.jpg", { maxBytes: 1_000_000, keepBytesUpTo: 200_000 });
    assert.equal(digest.sha256, sha(photo));
    assert.equal(digest.byteSize, photo.length);
    assert.equal(digest.declaredContentType, "image/jpeg");
    assert.deepEqual([...digest.head.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe0]);
    assert.equal(digest.head.length, 64);
    assert.ok(digest.bytes && Buffer.from(digest.bytes).equals(photo), "kept bytes are the object");
  });

  test("hashes a large object without keeping it", async () => {
    const video = Buffer.alloc(500_000, 3);
    video.write("ftypisom", 4, "ascii");
    objects.set("ppi_media/owner/sub/clip.mp4", video);
    const digest = await digestStoredObject("r2-private:///ppi_media/owner/sub/clip.mp4", { maxBytes: 1_000_000, keepBytesUpTo: 200_000 });
    assert.equal(digest.sha256, sha(video));
    assert.equal(digest.byteSize, video.length);
    assert.equal(digest.bytes, null);
    assert.equal(Buffer.from(digest.head.subarray(4, 12)).toString("ascii"), "ftypisom");
  });

  test("refuses objects over the size limit and empty objects", async () => {
    objects.set("ppi_media/owner/sub/huge.jpg", Buffer.alloc(300_000, 1));
    await assert.rejects(
      digestStoredObject("r2-private:///ppi_media/owner/sub/huge.jpg", { maxBytes: 100_000, keepBytesUpTo: 50_000 }),
      /exceeds the allowed size/,
    );
    objects.set("ppi_media/owner/sub/empty.jpg", Buffer.alloc(0));
    await assert.rejects(
      digestStoredObject("r2-private:///ppi_media/owner/sub/empty.jpg", { maxBytes: 100_000, keepBytesUpTo: 50_000 }),
      /empty/,
    );
  });
});
