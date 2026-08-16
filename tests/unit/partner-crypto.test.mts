import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

// A 32-byte AES key must exist before the module reads it.
process.env.PARTNER_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const {
  decryptSecret,
  encryptSecret,
  fingerprintPayload,
  generateConnectionToken,
  generateInstallationCode,
  generateWebhookSecret,
  normalizeInstallationCode,
  parseConnectionToken,
  secureCompareHex,
  sha256Hex,
  signWebhookPayload,
} = await import("../../src/features/partner/crypto.ts");

describe("installation codes", () => {
  test("are grouped, high-entropy, and stored only as a hash", () => {
    const { code, codeHash, codePrefix } = generateInstallationCode();

    assert.match(code, /^PPI-[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/);
    assert.equal(codeHash, sha256Hex(code));
    assert.ok(code.startsWith(codePrefix));
    assert.notEqual(codeHash, code, "the plaintext must never be the stored value");
  });

  test("avoid characters that are misread when typed by hand", () => {
    for (let i = 0; i < 50; i++) {
      const { code } = generateInstallationCode();
      assert.ok(!/[ILOU]/.test(code.slice(4)), `ambiguous character in ${code}`);
    }
  });

  test("do not repeat", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateInstallationCode().code);
    assert.equal(seen.size, 200);
  });

  test("normalize however the administrator pasted them", () => {
    const { code } = generateInstallationCode();
    const scrambled = code.toLowerCase().replace(/-/g, " ");

    assert.equal(normalizeInstallationCode(scrambled), code);
    assert.equal(normalizeInstallationCode(code), code);
    assert.equal(normalizeInstallationCode(`  ${code}  `), code);
  });

  test("reject anything that is not a full-length code", () => {
    assert.equal(normalizeInstallationCode("PPI-ABC"), "");
    assert.equal(normalizeInstallationCode(""), "");
    assert.equal(normalizeInstallationCode("x".repeat(40)), "");
  });
});

describe("connection tokens", () => {
  test("carry a lookup prefix and a hash that is not the token", () => {
    const { token, tokenHash, tokenPrefix, tokenLastFour } = generateConnectionToken();

    assert.equal(parseConnectionToken(token)?.prefix, tokenPrefix);
    assert.equal(tokenHash, sha256Hex(token));
    assert.ok(token.endsWith(tokenLastFour));
    assert.ok(!tokenHash.includes(token));
  });

  test("reject malformed tokens before any lookup", () => {
    assert.equal(parseConnectionToken("nonsense"), null);
    assert.equal(parseConnectionToken("ppi_short_abc"), null);
    assert.equal(parseConnectionToken(""), null);
    // Right shape, wrong alphabet in the prefix.
    assert.equal(parseConnectionToken(`ppi_ZZZZZZZZZZZZZZZZ_${"a".repeat(43)}`), null);
  });
});

describe("constant-time comparison", () => {
  test("matches equal digests and rejects differing ones", () => {
    const a = sha256Hex("value");
    assert.equal(secureCompareHex(a, a), true);
    assert.equal(secureCompareHex(a, sha256Hex("other")), false);
  });

  test("rejects rather than throws on length mismatch or junk", () => {
    assert.equal(secureCompareHex("abcd", "abcdef"), false);
    // Non-hex decodes to an empty buffer; two empty buffers must not match.
    assert.equal(secureCompareHex("zzzz", "zzzz"), false);
    assert.equal(secureCompareHex("", ""), false);
    assert.equal(secureCompareHex("abc", "abc"), false, "odd-length hex is malformed");
  });
});

describe("secret envelopes", () => {
  test("round-trip and are non-deterministic", () => {
    const secret = generateWebhookSecret();
    const first = encryptSecret(secret);
    const second = encryptSecret(secret);

    assert.notEqual(first, second, "a fresh IV must be used each time");
    assert.equal(decryptSecret(first), secret);
    assert.equal(decryptSecret(second), secret);
    assert.ok(!first.includes(secret));
    assert.ok(first.startsWith("v1."));
  });

  test("detect tampering", () => {
    const envelope = encryptSecret("whsec_original");
    const [version, iv, tag, ciphertext] = envelope.split(".");

    const flipped = Buffer.from(ciphertext, "base64url");
    flipped[0] ^= 0xff;

    assert.throws(() =>
      decryptSecret([version, iv, tag, flipped.toString("base64url")].join(".")),
    );
    assert.throws(() => decryptSecret("garbage"));
    assert.throws(() => decryptSecret("v2.a.b.c"));
  });
});

describe("webhook signatures", () => {
  const secret = "whsec_test";
  const timestamp = "1755400000";
  const rawBody = JSON.stringify({ eventId: "evt_1", type: "inspection.deliverables_ready" });

  test("are versioned and deterministic for identical input", () => {
    const signature = signWebhookPayload({ secret, timestamp, rawBody });

    assert.match(signature, /^v1=[0-9a-f]{64}$/);
    assert.equal(signature, signWebhookPayload({ secret, timestamp, rawBody }));
  });

  test("change when the body, the timestamp, or the secret changes", () => {
    const base = signWebhookPayload({ secret, timestamp, rawBody });

    assert.notEqual(base, signWebhookPayload({ secret, timestamp, rawBody: rawBody + " " }));
    assert.notEqual(base, signWebhookPayload({ secret, timestamp: "1755400001", rawBody }));
    assert.notEqual(base, signWebhookPayload({ secret: "whsec_other", timestamp, rawBody }));
  });

  test("bind the timestamp to the body, so the two cannot be swapped", () => {
    // Without the separator, ("12", "3...") and ("123", "...") would collide.
    const a = signWebhookPayload({ secret, timestamp: "12", rawBody: "3abc" });
    const b = signWebhookPayload({ secret, timestamp: "123", rawBody: "abc" });
    assert.notEqual(a, b);
  });
});

describe("payload fingerprints", () => {
  test("ignore key order so an honest retry is not read as a conflict", () => {
    const a = { externalActorId: "staff-1", vehicle: { vin: "1HGCM82633A004352", year: 2023 } };
    const b = { vehicle: { year: 2023, vin: "1HGCM82633A004352" }, externalActorId: "staff-1" };

    assert.equal(fingerprintPayload(a), fingerprintPayload(b));
  });

  test("change when a value materially changes", () => {
    const base = fingerprintPayload({ vin: "1HGCM82633A004352", mileage: 24150 });

    assert.notEqual(base, fingerprintPayload({ vin: "1HGCM82633A004352", mileage: 24151 }));
    assert.notEqual(base, fingerprintPayload({ vin: "1HGCM82633A004353", mileage: 24150 }));
  });

  test("treat an absent field and an explicit undefined identically", () => {
    assert.equal(
      fingerprintPayload({ a: 1, b: undefined }),
      fingerprintPayload({ a: 1 }),
    );
  });

  test("distinguish null from a missing key", () => {
    assert.notEqual(fingerprintPayload({ a: 1, b: null }), fingerprintPayload({ a: 1 }));
  });

  test("preserve array order", () => {
    assert.notEqual(fingerprintPayload([1, 2]), fingerprintPayload([2, 1]));
  });
});
