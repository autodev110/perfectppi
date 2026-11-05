import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import {
  PARTNER_SYSTEMS,
  autoDeliverySystems,
  browserConnectCallback,
  browserConnectOrigin,
  isBrowserConnectDestination,
  isPartnerSystem,
  partnerLabel,
} from "../../src/features/partner/systems.ts";

const shopowl = PARTNER_SYSTEMS.shopowl;
const dealerspace = PARTNER_SYSTEMS.dealerspace;

function restore() {
  delete process.env.PARTNER_SHOPOWL_APP_URL;
  delete process.env.PARTNER_ALLOW_INSECURE_CALLBACKS;
}

describe("partner system registry", () => {
  afterEach(restore);

  it("recognizes only real systems, including against prototype keys", () => {
    assert.equal(isPartnerSystem("shopowl"), true);
    assert.equal(isPartnerSystem("dealerspace"), true);
    assert.equal(isPartnerSystem("perfectppi"), false);
    assert.equal(isPartnerSystem("constructor"), false);
    assert.equal(isPartnerSystem(undefined), false);
  });

  it("delivers automatically only where a partner has no Send button", () => {
    assert.deepEqual(autoDeliverySystems(), ["shopowl"]);
    assert.equal(dealerspace.autoDeliver, false);
  });

  it("labels known systems and survives unknown ones", () => {
    assert.equal(partnerLabel("shopowl"), "ShopOwl");
    assert.equal(partnerLabel("future"), "future");
    assert.equal(partnerLabel(null), "Partner");
  });

  it("gives the manual partner no browser destination at all", () => {
    assert.equal(browserConnectCallback(dealerspace), null);
    assert.equal(isBrowserConnectDestination(dealerspace, "https://my.shopowl.io/x"), false);
  });

  it("sends a code only to the fixed callback on the configured origin", () => {
    assert.equal(
      browserConnectCallback(shopowl),
      "https://my.shopowl.io/api/integrations/perfectppi/callback",
    );
  });

  it("rejects an override that carries anything beyond an HTTPS origin", () => {
    for (const bad of [
      "http://my.shopowl.io",
      "https://user:pass@my.shopowl.io",
      "https://my.shopowl.io/path",
      "https://my.shopowl.io/?next=evil",
      "not a url",
    ]) {
      process.env.PARTNER_SHOPOWL_APP_URL = bad;
      assert.equal(browserConnectOrigin(shopowl), null, bad);
      assert.equal(browserConnectCallback(shopowl), null, bad);
    }
  });

  it("allows loopback over HTTP only with the development switch", () => {
    process.env.PARTNER_SHOPOWL_APP_URL = "http://localhost:3000";
    assert.equal(browserConnectOrigin(shopowl), null);
    process.env.PARTNER_ALLOW_INSECURE_CALLBACKS = "true";
    assert.equal(browserConnectOrigin(shopowl), "http://localhost:3000");
    // The switch never relaxes a public address.
    process.env.PARTNER_SHOPOWL_APP_URL = "http://my.shopowl.io";
    assert.equal(browserConnectOrigin(shopowl), null);
  });

  it("only treats URLs on the partner's own origin as its destinations", () => {
    assert.equal(
      isBrowserConnectDestination(shopowl, "https://my.shopowl.io/api/webhooks/perfectppi"),
      true,
    );
    for (const bad of [
      "https://my.shopowl.io.evil.example/api/webhooks/perfectppi",
      "https://evil.example/https://my.shopowl.io",
      "not a url",
    ]) {
      assert.equal(isBrowserConnectDestination(shopowl, bad), false, bad);
    }
  });
});

describe("browser-connect code binding", () => {
  // crypto.ts reads no environment at import time for these helpers.
  const load = () => import("../../src/features/partner/crypto.ts");
  const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  it("accepts only the verifier that produced the challenge", async () => {
    const { pkceVerifierMatches } = await load();
    assert.equal(pkceVerifierMatches(verifier, challenge), true);
    assert.equal(pkceVerifierMatches(`${verifier}x`, challenge), false);
  });

  it("treats a missing or malformed verifier as a plain failure", async () => {
    const { pkceVerifierMatches } = await load();
    for (const bad of [undefined, null, "", "short", 42, "spaces are not allowed ".repeat(4)]) {
      assert.equal(pkceVerifierMatches(bad, challenge), false);
    }
    assert.equal(pkceVerifierMatches(verifier, "not-a-challenge"), false);
  });

  it("recognizes the challenge format the database enforces", async () => {
    const { isPkceChallenge } = await load();
    assert.equal(isPkceChallenge(challenge), true);
    assert.equal(isPkceChallenge("too-short"), false);
    assert.equal(isPkceChallenge(`${challenge}A`), false);
    assert.equal(isPkceChallenge(null), false);
  });
});
