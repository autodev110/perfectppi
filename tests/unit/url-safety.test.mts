import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  checkUrlShape,
  checkUrlIsSafeDestination,
  isPublicAddress,
} from "../../src/features/partner/url-safety.ts";

// ============================================================================
// The webhook and user-link callback URLs are the only partner-supplied
// destinations Perfect PPI ever contacts. These are the tests that keep them
// from becoming an SSRF or open-redirect vector.
// ============================================================================

beforeEach(() => {
  delete process.env.PARTNER_ALLOW_INSECURE_CALLBACKS;
});

describe("URL shape", () => {
  test("accepts ordinary https endpoints", () => {
    const result = checkUrlShape("https://dealerspace.example.com/api/integrations/perfectppi/webhook");
    assert.equal(result.ok, true);
  });

  test("rejects plaintext http by default", () => {
    const result = checkUrlShape("http://dealerspace.example.com/hook");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "unsupported_scheme");
  });

  test("rejects non-http schemes outright", () => {
    for (const url of ["file:///etc/passwd", "gopher://x/", "javascript:alert(1)", "data:text/html,x"]) {
      assert.equal(checkUrlShape(url).ok, false, `${url} must be rejected`);
    }
  });

  test("rejects embedded credentials that disguise the real host", () => {
    const result = checkUrlShape("https://trusted.example.com@evil.example.net/hook");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "credentials_in_url");
  });

  test("rejects malformed and oversized input", () => {
    assert.equal(checkUrlShape("not a url").reason, "invalid_url");
    assert.equal(checkUrlShape("").reason, "too_long");
    assert.equal(checkUrlShape(`https://x.example.com/${"a".repeat(3000)}`).reason, "too_long");
  });

  test("permits http only when the deployment opts in", () => {
    process.env.PARTNER_ALLOW_INSECURE_CALLBACKS = "true";
    assert.equal(checkUrlShape("http://localhost:3001/hook").ok, true);
  });
});

describe("address classification", () => {
  test("treats every reserved IPv4 range as private", () => {
    const reserved = [
      "0.0.0.0",
      "10.1.2.3",
      "127.0.0.1",
      "169.254.169.254", // cloud instance metadata
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1", // CGNAT
      "198.18.0.1", // benchmarking
      "192.0.2.1", // TEST-NET-1
      "198.51.100.1", // TEST-NET-2
      "203.0.113.1", // TEST-NET-3
      "224.0.0.1", // multicast
      "255.255.255.255",
    ];

    for (const address of reserved) {
      assert.equal(isPublicAddress(address), false, `${address} must not be public`);
    }
  });

  test("accepts genuinely routable IPv4", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "104.16.0.1", "172.32.0.1", "192.167.1.1"]) {
      assert.equal(isPublicAddress(address), true, `${address} should be public`);
    }
  });

  test("treats reserved IPv6 as private", () => {
    for (const address of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1"]) {
      assert.equal(isPublicAddress(address), false, `${address} must not be public`);
    }
  });

  test("judges IPv4-mapped IPv6 by the embedded address", () => {
    // The classic bypass: metadata service wearing an IPv6 costume.
    assert.equal(isPublicAddress("::ffff:169.254.169.254"), false);
    assert.equal(isPublicAddress("::ffff:127.0.0.1"), false);
    assert.equal(isPublicAddress("::ffff:8.8.8.8"), true);
  });

  test("accepts routable IPv6", () => {
    assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  });

  test("rejects anything that is not an IP address", () => {
    assert.equal(isPublicAddress("example.com"), false);
    assert.equal(isPublicAddress(""), false);
    assert.equal(isPublicAddress("999.999.999.999"), false);
  });
});

describe("full destination check", () => {
  test("rejects a literal private address in the URL", async () => {
    const result = await checkUrlIsSafeDestination("https://169.254.169.254/latest/meta-data/");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "private_address");
  });

  test("rejects loopback by name unless explicitly allowed", async () => {
    const result = await checkUrlIsSafeDestination("https://127.0.0.1/hook");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "private_address");
  });

  test("rejects a hostname that does not resolve", async () => {
    const result = await checkUrlIsSafeDestination(
      "https://this-host-should-not-exist-perfectppi-test.invalid/hook",
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "unresolvable_host");
  });

  test("allows localhost only under the development opt-in", async () => {
    process.env.PARTNER_ALLOW_INSECURE_CALLBACKS = "true";
    const result = await checkUrlIsSafeDestination("http://localhost:3001/hook");
    assert.equal(result.ok, true);
  });
});
