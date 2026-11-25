import { test } from "node:test";
import assert from "node:assert/strict";
import { createFacilitator, facilitatorConfig, missingApiKey } from "../src/facilitator.js";

const OZ_TESTNET = "https://channels.openzeppelin.com/x402/testnet";
const X402_ORG = "https://www.x402.org/facilitator";

test("facilitatorConfig: without a key it sends no auth", () => {
  assert.deepEqual(facilitatorConfig({ url: X402_ORG }), { url: X402_ORG });
  assert.deepEqual(facilitatorConfig({ url: X402_ORG, apiKey: "   " }), { url: X402_ORG });
});

test("facilitatorConfig: the key is sent as a Bearer token on verify, settle and supported", async () => {
  const config = facilitatorConfig({ url: OZ_TESTNET, apiKey: "  secret-key \n" });
  const headers = await config.createAuthHeaders();
  for (const path of ["verify", "settle", "supported"]) {
    assert.deepEqual(headers[path], { Authorization: "Bearer secret-key" }, path);
  }
  assert.equal(headers.Authorization, undefined, "x402 needs headers keyed by path, not a flat object");
});

test("createFacilitator: the Authorization header really goes out on the wire", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), authorization: new Headers(options?.headers).get("authorization") });
    return Response.json({ kinds: [{ x402Version: 2, scheme: "exact", network: "stellar:testnet" }], extensions: [], signers: {} });
  };
  try {
    const supported = await createFacilitator({ url: OZ_TESTNET, apiKey: "k-123" }).getSupported();
    assert.equal(supported.kinds[0].network, "stellar:testnet");
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/supported$/);
    assert.equal(calls[0].authorization, "Bearer k-123");

    calls.length = 0;
    await createFacilitator({ url: X402_ORG }).getSupported();
    assert.equal(calls[0].authorization, null, "no key, no Authorization header");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("missingApiKey: only OpenZeppelin Channels needs a key, and only when it is absent", () => {
  assert.equal(missingApiKey({ url: OZ_TESTNET }), true);
  assert.equal(missingApiKey({ url: OZ_TESTNET, apiKey: "  " }), true);
  assert.equal(missingApiKey({ url: OZ_TESTNET, apiKey: "k" }), false);
  assert.equal(missingApiKey({ url: X402_ORG }), false);
  assert.equal(missingApiKey({ url: "https://channels.openzeppelin.com.evil.example/x402" }), false);
});
