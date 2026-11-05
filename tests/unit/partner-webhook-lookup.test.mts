import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { describe, it } from "node:test";
import { pinnedLookup } from "../../src/features/partner/url-safety.ts";

describe("pinned webhook lookup", () => {
  it("reaches the validated address through a real connection, whatever the hostname says", async () => {
    const server = createServer((_request, response) => response.writeHead(204).end());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };

    const status = await new Promise<number | undefined>((resolve, reject) => {
      const outbound = request(
        {
          // A name that does not resolve: only the pinned answer can succeed.
          hostname: "partner.invalid",
          port,
          path: "/",
          method: "POST",
          lookup: pinnedLookup("127.0.0.1") as never,
        },
        (response) => {
          response.destroy();
          resolve(response.statusCode);
        },
      );
      outbound.on("error", reject);
      outbound.end();
    });
    server.close();
    assert.equal(status, 204);
  });

  it("answers in the form each lookup mode expects", () => {
    const single: unknown[] = [];
    pinnedLookup("203.0.113.7")("x", {}, (...args) => single.push(...args));
    assert.deepEqual(single, [null, "203.0.113.7", 4]);

    const list: unknown[] = [];
    pinnedLookup("2001:db8::1")("x", { all: true }, (...args) => list.push(...args));
    assert.deepEqual(list, [null, [{ address: "2001:db8::1", family: 6 }]]);
  });
});
